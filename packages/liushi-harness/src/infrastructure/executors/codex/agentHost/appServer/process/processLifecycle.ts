import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash } from "node:crypto";
import { StringDecoder } from "node:string_decoder";
import { clearTimeout, setTimeout } from "node:timers";

import type {
  CodexAppServerError,
  CodexAppServerConfig,
  CodexAppServerProcessInfo,
  CodexAppServerProtocolProvider,
  CodexAppServerResult,
  CodexAppServerTerminateProcessTree,
} from "../contracts/index.js";
import { CODEX_APP_SERVER_TERMINATION_REASONS } from "../enums/index.js";
import { createCodexAppServerProcessCompletion } from "./processCompletion.js";
import { createCodexAppServerProcessError, toBuffer } from "./processHelpers.js";
import { createCodexAppServerProcessIo } from "./processIo.js";

/** 创建进程生命周期所需的依赖。 */
interface CodexAppServerProcessLifecycleOptions {
  readonly config: CodexAppServerConfig;
  readonly child: ChildProcessWithoutNullStreams;
  readonly protocolProvider: CodexAppServerProtocolProvider;
  readonly terminateChild: CodexAppServerTerminateProcessTree;
  readonly resolve: (result: CodexAppServerResult) => void;
  readonly reject: (reason: unknown) => void;
}

/** 进程生命周期操作集合。 */
interface CodexAppServerProcessLifecycle {
  readonly handleStdout: (chunk: unknown) => void;
  readonly handleStderr: (chunk: unknown) => void;
  readonly handleStdinError: (cause: unknown) => void;
  readonly attachCommonListeners: () => void;
  readonly handleMissingStreams: () => void;
  readonly start: () => void;
}

/** 创建并管理一个 App Server 子进程的生命周期状态。 */
export function createCodexAppServerProcessLifecycle(
  options: CodexAppServerProcessLifecycleOptions,
): CodexAppServerProcessLifecycle {
  const { config, child, terminateChild, resolve, reject } = options;
  const stdoutDecoder = new StringDecoder("utf8");
  const stderrDecoder = new StringDecoder("utf8");
  const stdoutDigest = createHash("sha256");
  const stderrDigest = createHash("sha256");
  let stdoutBuffer = "";
  let stdoutBytes = 0;
  let stderrBytes = 0;
  let closed = false;
  let closeCode: number | null = null;
  let closeSignal: NodeJS.Signals | null = null;
  let settled = false;
  let messageChain: Promise<void> = Promise.resolve();
  let messageChainSettled = false;
  let terminationStarted = false;
  let terminationConfirmed = false;
  let terminationConfirmationTimer: ReturnType<typeof setTimeout> | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let transportFailure: CodexAppServerError | null = null;
  let messageChainAbandoned = false;
  let terminationReason: CODEX_APP_SERVER_TERMINATION_REASONS | null = null;
  let timedOut = false;
  let outputLimitExceeded = false;
  let stderrLimitExceeded = false;

  const processInfo = (): CodexAppServerProcessInfo => ({
    processStarted: true,
    processMayBeRunning: false,
    outcomeUnknown: false,
    exitCode: closeCode,
    signal: closeSignal,
    timedOut,
    outputLimitExceeded,
    stderrLimitExceeded,
    terminationReason,
    stdoutBytes,
    stderrBytes,
    stdoutDigest: stdoutDigest.copy().digest("hex"),
    stderrDigest: stderrDigest.copy().digest("hex"),
  });

  const requestTermination = (
    reason: CODEX_APP_SERVER_TERMINATION_REASONS,
    cause?: unknown,
  ): void => {
    if (terminationStarted || settled) return;
    terminationStarted = true;
    terminationReason = reason;
    timedOut ||= reason === CODEX_APP_SERVER_TERMINATION_REASONS.Timeout;
    outputLimitExceeded ||= reason === CODEX_APP_SERVER_TERMINATION_REASONS.OutputLimit;
    stderrLimitExceeded ||= reason === CODEX_APP_SERVER_TERMINATION_REASONS.StderrLimit;
    if (
      reason === CODEX_APP_SERVER_TERMINATION_REASONS.Timeout ||
      reason === CODEX_APP_SERVER_TERMINATION_REASONS.OutputLimit ||
      reason === CODEX_APP_SERVER_TERMINATION_REASONS.StderrLimit
    ) {
      messageChainAbandoned = true;
      protocol.abort?.(reason);
    }
    if (cause !== undefined && transportFailure === null) {
      transportFailure = createCodexAppServerProcessError(
        "codex app-server transport failed",
        cause,
        true,
        true,
      );
    }
    destroyStdin();
    void Promise.resolve()
      .then(() => terminateChild(child))
      .then(
        () => {
          terminationConfirmed = true;
          if (closed) finish();
          else armTerminationConfirmationTimer();
        },
        (terminationError: unknown) => {
          rejectUnknownTermination(terminationError);
        },
      );
  };

  const processIo = createCodexAppServerProcessIo({
    child,
    isSettled: () => settled,
    requestTermination,
    getTransportFailure: () => transportFailure,
    setTransportFailure: (error) => {
      transportFailure = error;
    },
  });
  const { io, handleProtocolFailure } = processIo;
  const protocol =
    typeof options.protocolProvider === "function"
      ? options.protocolProvider(io)
      : options.protocolProvider;
  const completion = createCodexAppServerProcessCompletion({
    config,
    protocol,
    getState: () => ({
      settled,
      closed,
      messageChainSettled,
      messageChainAbandoned,
      terminationStarted,
      terminationConfirmed,
      timeout,
      terminationConfirmationTimer,
      terminationReason,
      closeCode,
      closeSignal,
      transportFailure,
    }),
    setSettled: (value) => {
      settled = value;
    },
    setTerminationConfirmationTimer: (value) => {
      terminationConfirmationTimer = value;
    },
    clearTerminationConfirmationTimer: () => {
      if (terminationConfirmationTimer !== undefined) clearTimeout(terminationConfirmationTimer);
      terminationConfirmationTimer = undefined;
    },
    processInfo,
    resolve,
    reject,
  });
  const { finish, armTerminationConfirmationTimer, rejectUnknownTermination } = completion;

  function attachCommonListeners(): void {
    child.on("error", (cause: unknown) => {
      if (settled) return;
      transportFailure ??= createCodexAppServerProcessError(
        "codex app-server process failed",
        cause,
        true,
        true,
      );
      requestTermination(CODEX_APP_SERVER_TERMINATION_REASONS.ProcessError, cause);
    });

    child.on("close", (code: number | null, signal: NodeJS.Signals | null) => {
      if (closed) return;
      closed = true;
      closeCode = code;
      closeSignal = signal;
      if (timeout !== undefined) clearTimeout(timeout);
      stdoutBuffer += stdoutDecoder.end();
      stderrDecoder.end();
      const trailingLine = stdoutBuffer.trim();
      stdoutBuffer = "";
      if (trailingLine.length > 0 && !settled) enqueueLine(trailingLine);
      void messageChain.finally(() => {
        messageChainSettled = true;
        finish();
      });
    });
  }

  function enqueueLine(line: string): void {
    messageChain = messageChain
      .then(() => protocol.handleLine(line))
      .catch((cause: unknown) => handleProtocolFailure(cause));
  }

  function destroyStdin(): void {
    try {
      child.stdin?.destroy();
    } catch (cause) {
      transportFailure ??= createCodexAppServerProcessError(
        "codex app-server stdin could not close",
        cause,
        true,
        true,
      );
    }
  }

  const lifecycle: CodexAppServerProcessLifecycle = {
    handleStdout: (chunk: unknown): void => {
      if (settled || outputLimitExceeded || closed) return;
      const buffer = toBuffer(chunk);
      stdoutBytes += buffer.length;
      stdoutDigest.update(buffer);
      if (stdoutBytes > config.outputLimitBytes) {
        requestTermination(CODEX_APP_SERVER_TERMINATION_REASONS.OutputLimit);
        return;
      }
      stdoutBuffer += stdoutDecoder.write(buffer);
      const lines = stdoutBuffer.split(/\r?\n/u);
      stdoutBuffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.length === 0 || settled) continue;
        enqueueLine(line);
      }
    },
    handleStderr: (chunk: unknown): void => {
      if (settled || stderrLimitExceeded || closed) return;
      const buffer = toBuffer(chunk);
      stderrBytes += buffer.length;
      stderrDigest.update(buffer);
      if (stderrBytes > config.stderrLimitBytes) {
        requestTermination(CODEX_APP_SERVER_TERMINATION_REASONS.StderrLimit);
      }
    },
    handleStdinError: (cause: unknown): void => {
      if (!closed && !terminationStarted) {
        transportFailure = createCodexAppServerProcessError(
          "codex app-server stdin failed",
          cause,
          true,
          true,
        );
        requestTermination(CODEX_APP_SERVER_TERMINATION_REASONS.ProcessError);
      }
    },
    attachCommonListeners,
    handleMissingStreams: (): void => {
      transportFailure = createCodexAppServerProcessError(
        "codex app-server did not provide stdin/stdout/stderr",
        undefined,
        true,
        false,
      );
      requestTermination(CODEX_APP_SERVER_TERMINATION_REASONS.ProcessError);
    },
    start: (): void => {
      timeout = setTimeout(() => {
        requestTermination(CODEX_APP_SERVER_TERMINATION_REASONS.Timeout);
      }, config.timeoutMs);
      try {
        protocol.start();
      } catch (cause) {
        handleProtocolFailure(cause);
      }
    },
  };
  return lifecycle;
}
