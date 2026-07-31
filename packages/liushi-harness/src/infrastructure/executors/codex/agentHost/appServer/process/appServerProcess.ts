import { spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";

import {
  type CodexAppServerConfig,
  type CodexAppServerProtocolProvider,
  type CodexAppServerResult,
  type CodexAppServerRunnerOverrides,
  type CodexAppServerSpawnProcess,
  type CodexAppServerTerminateProcessTree,
} from "../contracts/index.js";
import { CODEX_APP_SERVER_TERMINATION_REASONS } from "../enums/index.js";
import { shouldCreateDetachedProcessGroup, terminateProcessTree } from "../platform/index.js";
import { createCodexAppServerProcessLifecycle } from "./processLifecycle.js";
import { createCodexAppServerProcessError, hasRequiredStreams } from "./processHelpers.js";

/** 在受限标准流环境中运行 Codex App Server。 */
export function runCodexAppServerProcess(
  config: CodexAppServerConfig,
  protocolProvider: CodexAppServerProtocolProvider,
  overrides: CodexAppServerRunnerOverrides = {},
): Promise<CodexAppServerResult> {
  const spawnProcess: CodexAppServerSpawnProcess =
    overrides.spawnProcess ??
    ((executable, arguments_, options) =>
      spawn(executable, [...arguments_], {
        cwd: options.cwd,
        env: options.env,
        shell: false,
        windowsHide: true,
        detached: options.detached,
        stdio: ["pipe", "pipe", "pipe"],
      }));
  const terminateChild = overrides.terminateProcessTree ?? terminateProcessTree;

  return new Promise<CodexAppServerResult>((resolve, reject) => {
    let child: ChildProcessWithoutNullStreams;
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
      reject(
        createCodexAppServerProcessError("codex app-server could not start", cause, false, false),
      );
      return;
    }

    let lifecycle: ReturnType<typeof createCodexAppServerProcessLifecycle>;
    try {
      lifecycle = createCodexAppServerProcessLifecycle({
        config,
        child,
        protocolProvider,
        terminateChild,
        resolve,
        reject,
      });
    } catch (cause) {
      void rejectProtocolInitializationFailure(child, terminateChild, reject, cause);
      return;
    }

    if (!hasRequiredStreams(child)) {
      const candidate = child as unknown as { readonly on?: unknown };
      if (typeof candidate.on === "function") lifecycle.attachCommonListeners();
      lifecycle.handleMissingStreams();
      return;
    }

    child.stdout.on("data", lifecycle.handleStdout);
    child.stderr.on("data", lifecycle.handleStderr);
    child.stdin.on("error", lifecycle.handleStdinError);
    lifecycle.attachCommonListeners();
    lifecycle.start();
  });
}

/** 协议构造失败时先确认回收子进程，再报告可判定的失败状态。 */
async function rejectProtocolInitializationFailure(
  child: ChildProcessWithoutNullStreams,
  terminateChild: CodexAppServerTerminateProcessTree,
  reject: (reason: unknown) => void,
  cause: unknown,
): Promise<void> {
  try {
    await terminateChild(child);
  } catch (terminationCause) {
    const error = createCodexAppServerProcessError(
      "codex app-server process tree termination is unconfirmed",
      terminationCause,
      true,
      true,
    );
    error.terminationReason = CODEX_APP_SERVER_TERMINATION_REASONS.ProcessError;
    reject(error);
    return;
  }

  const error = createCodexAppServerProcessError(
    "codex app-server protocol could not start",
    cause,
    true,
    false,
  );
  error.terminationReason = CODEX_APP_SERVER_TERMINATION_REASONS.ProcessError;
  reject(error);
}
