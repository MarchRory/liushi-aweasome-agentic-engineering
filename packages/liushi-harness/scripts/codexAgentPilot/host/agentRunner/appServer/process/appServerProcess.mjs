import { spawn } from "node:child_process";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { StringDecoder } from "node:string_decoder";
import { clearTimeout, setTimeout } from "node:timers";

import {
  shouldCreateDetachedProcessGroup,
  terminateProcessTree,
} from "../../../../../common/process/index.mjs";
import {
  CODEX_APP_SERVER_OUTCOMES,
  CODEX_APP_SERVER_TERMINATION_REASONS,
} from "../codexAppServerConstants.mjs";

export function runCodexAppServerProcess(config, protocolFactory, overrides = {}) {
  const spawnProcess = overrides.spawnProcess ?? spawn;
  const terminateChild = overrides.terminateProcessTree ?? terminateProcessTree;

  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnProcess(config.executable, config.arguments, {
        cwd: config.cwd,
        env: config.environment,
        shell: false,
        windowsHide: true,
        detached: shouldCreateDetachedProcessGroup(),
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (cause) {
      reject(createProcessError("codex app-server could not start", cause, false, false));
      return;
    }

    const stdoutDecoder = new StringDecoder("utf8");
    const stderrDecoder = new StringDecoder("utf8");
    const stdoutDigest = createHash("sha256");
    const stderrDigest = createHash("sha256");
    let stdoutBuffer = "";
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let closed = false;
    let closeCode = null;
    let closeSignal = null;
    let settled = false;
    let messageChain = Promise.resolve();
    let messageChainSettled = false;
    let terminationStarted = false;
    let terminationConfirmed = false;
    let terminationConfirmationTimer;
    let timeout;
    let transportFailure = null;
    let messageChainAbandoned = false;
    let terminationReason = null;
    let timedOut = false;
    let outputLimitExceeded = false;
    let stderrLimitExceeded = false;

    const processInfo = () => ({
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

    const requestTermination = (reason, cause) => {
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
        transportFailure = createProcessError(
          "codex app-server transport failed",
          cause,
          true,
          true,
        );
      }
      destroyStdin();
      Promise.resolve()
        .then(() => terminateChild(child))
        .then(
          () => {
            terminationConfirmed = true;
            if (closed) finish();
            else armTerminationConfirmationTimer();
          },
          (terminationError) => {
            rejectUnknownTermination(terminationError);
          },
        );
    };

    const send = (message) => {
      if (settled || child.stdin === null || child.stdin.destroyed) {
        throw createProcessError("codex app-server stdin is unavailable", undefined, true, true);
      }
      try {
        child.stdin.write(`${JSON.stringify(message)}\n`, "utf8");
      } catch (cause) {
        requestTermination(CODEX_APP_SERVER_TERMINATION_REASONS.ProcessError, cause);
        throw createProcessError("codex app-server stdin write failed", cause, true, true);
      }
    };

    const closeInput = () => {
      if (settled || child.stdin === null || child.stdin.destroyed) return;
      try {
        child.stdin.end();
      } catch (cause) {
        requestTermination(CODEX_APP_SERVER_TERMINATION_REASONS.ProcessError, cause);
      }
    };

    const handleProtocolFailure = (
      error,
      reason = CODEX_APP_SERVER_TERMINATION_REASONS.ProtocolError,
    ) => {
      if (transportFailure === null && error !== null && error !== undefined) {
        transportFailure = error;
      }
      requestTermination(reason);
    };

    const io = {
      send,
      closeInput,
      requestTermination: (reason) => requestTermination(reason),
    };
    const protocol = typeof protocolFactory === "function" ? protocolFactory(io) : protocolFactory;

    if (!hasRequiredStreams(child)) {
      if (typeof child?.on === "function") attachCommonListeners(child);
      transportFailure = createProcessError(
        "codex app-server did not provide stdin/stdout/stderr",
        undefined,
        true,
        false,
      );
      requestTermination(CODEX_APP_SERVER_TERMINATION_REASONS.ProcessError);
      return;
    }

    child.stdout.on("data", (chunk) => {
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
    });

    child.stderr.on("data", (chunk) => {
      if (settled || stderrLimitExceeded || closed) return;
      const buffer = toBuffer(chunk);
      stderrBytes += buffer.length;
      stderrDigest.update(buffer);
      if (stderrBytes > config.stderrLimitBytes) {
        requestTermination(CODEX_APP_SERVER_TERMINATION_REASONS.StderrLimit);
      }
    });

    child.stdin.on("error", (cause) => {
      if (!closed && !terminationStarted) {
        transportFailure = createProcessError("codex app-server stdin failed", cause, true, true);
        requestTermination(CODEX_APP_SERVER_TERMINATION_REASONS.ProcessError);
      }
    });
    attachCommonListeners(child);

    timeout = setTimeout(() => {
      requestTermination(CODEX_APP_SERVER_TERMINATION_REASONS.Timeout);
    }, config.timeoutMs);

    try {
      protocol.start();
    } catch (cause) {
      handleProtocolFailure(cause);
    }

    function attachCommonListeners(processChild) {
      processChild.on("error", (cause) => {
        if (settled) return;
        transportFailure ??= createProcessError(
          "codex app-server process failed",
          cause,
          true,
          true,
        );
        requestTermination(CODEX_APP_SERVER_TERMINATION_REASONS.ProcessError, cause);
      });
      processChild.on("close", (code, signal) => {
        if (closed) return;
        closed = true;
        closeCode = code;
        closeSignal = signal;
        clearTimeout(timeout);
        stdoutBuffer += stdoutDecoder.end();
        stderrDecoder.end();
        const trailingLine = stdoutBuffer.trim();
        stdoutBuffer = "";
        if (trailingLine.length > 0 && !settled) enqueueLine(trailingLine);
        messageChain.finally(() => {
          messageChainSettled = true;
          finish();
        });
      });
    }

    function enqueueLine(line) {
      messageChain = messageChain
        .then(() => protocol.handleLine(line))
        .catch((cause) => handleProtocolFailure(cause));
    }

    function destroyStdin() {
      try {
        child.stdin?.destroy();
      } catch (cause) {
        transportFailure ??= createProcessError(
          "codex app-server stdin could not close",
          cause,
          true,
          true,
        );
      }
    }

    function armTerminationConfirmationTimer() {
      if (terminationConfirmationTimer !== undefined || closed || settled) return;
      terminationConfirmationTimer = setTimeout(() => {
        rejectUnknownTermination(new Error("codex app-server exit could not be confirmed"));
      }, config.terminationConfirmationTimeoutMs);
    }

    function rejectUnknownTermination(cause) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearTimeout(terminationConfirmationTimer);
      const error = createProcessError(
        "codex app-server process tree termination is unconfirmed",
        cause,
        true,
        true,
      );
      error.outcomeUnknown = true;
      error.terminationReason = terminationReason;
      error.protocolEvidence = protocol.getEvidence();
      reject(error);
    }

    function finish() {
      if (settled || !closed || (!messageChainSettled && !messageChainAbandoned)) return;
      if (terminationStarted && !terminationConfirmed) return;
      settled = true;
      clearTimeout(timeout);
      clearTimeout(terminationConfirmationTimer);
      const info = processInfo();

      if (transportFailure !== null) {
        transportFailure.protocolEvidence = protocol.getEvidence();
        transportFailure.processMayBeRunning = false;
        transportFailure.outcomeUnknown = false;
        reject(transportFailure);
        return;
      }

      if (
        terminationReason === CODEX_APP_SERVER_TERMINATION_REASONS.Timeout ||
        terminationReason === CODEX_APP_SERVER_TERMINATION_REASONS.OutputLimit ||
        terminationReason === CODEX_APP_SERVER_TERMINATION_REASONS.StderrLimit
      ) {
        resolve({
          outcome: protocol.getPolicyDenied()
            ? CODEX_APP_SERVER_OUTCOMES.Denied
            : CODEX_APP_SERVER_OUTCOMES.Interrupted,
          process: info,
          protocolEvidence: protocol.getEvidence(),
        });
        return;
      }

      try {
        const result = protocol.finalize(info);
        if (
          result.outcome === CODEX_APP_SERVER_OUTCOMES.Succeeded &&
          (closeCode !== 0 || closeSignal !== null)
        ) {
          result.outcome = CODEX_APP_SERVER_OUTCOMES.Failed;
        }
        resolve(result);
      } catch (cause) {
        const error = cause instanceof Error ? cause : new Error(String(cause));
        error.protocolEvidence ??= protocol.getEvidence();
        reject(error);
      }
    }
  });
}

function hasRequiredStreams(child) {
  return (
    child !== null &&
    typeof child === "object" &&
    child.stdin !== null &&
    child.stdout !== null &&
    child.stderr !== null &&
    typeof child.stdin?.on === "function" &&
    typeof child.stdout?.on === "function" &&
    typeof child.stderr?.on === "function" &&
    typeof child.on === "function"
  );
}

function toBuffer(value) {
  return Buffer.isBuffer(value) ? value : Buffer.from(value);
}

function createProcessError(message, cause, processStarted, processMayBeRunning) {
  const error = new Error(message, cause === undefined ? undefined : { cause });
  error.processStarted = processStarted;
  error.processMayBeRunning = processMayBeRunning;
  error.outcomeUnknown = processMayBeRunning;
  error.timedOut = false;
  error.outputLimitExceeded = false;
  error.stderrLimitExceeded = false;
  error.terminationReason = null;
  return error;
}
