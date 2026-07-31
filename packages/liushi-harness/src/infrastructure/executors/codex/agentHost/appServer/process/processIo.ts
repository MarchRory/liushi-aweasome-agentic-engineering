import type { ChildProcessWithoutNullStreams } from "node:child_process";

import type { CodexAppServerError, CodexAppServerIo } from "../contracts/index.js";
import { CODEX_APP_SERVER_TERMINATION_REASONS } from "../enums/index.js";
import { asCodexAppServerError, createCodexAppServerProcessError } from "./processHelpers.js";

/** 创建进程 IO 操作所需的依赖。 */
interface CodexAppServerProcessIoOptions {
  readonly child: ChildProcessWithoutNullStreams;
  readonly isSettled: () => boolean;
  readonly requestTermination: (
    reason: CODEX_APP_SERVER_TERMINATION_REASONS,
    cause?: unknown,
  ) => void;
  readonly getTransportFailure: () => CodexAppServerError | null;
  readonly setTransportFailure: (error: CodexAppServerError) => void;
}

/** 进程 IO 操作集合。 */
interface CodexAppServerProcessIo {
  readonly io: CodexAppServerIo;
  readonly handleProtocolFailure: (
    error: unknown,
    reason?: CODEX_APP_SERVER_TERMINATION_REASONS,
  ) => void;
}

/** 创建协议写入、输入关闭和协议错误收口操作。 */
export function createCodexAppServerProcessIo(
  options: CodexAppServerProcessIoOptions,
): CodexAppServerProcessIo {
  const { child, isSettled, requestTermination, getTransportFailure, setTransportFailure } =
    options;

  const send = (message: Parameters<CodexAppServerIo["send"]>[0]): void => {
    if (isSettled() || child.stdin === null || child.stdin.destroyed) {
      throw createCodexAppServerProcessError(
        "codex app-server stdin is unavailable",
        undefined,
        true,
        true,
      );
    }
    try {
      child.stdin.write(`${JSON.stringify(message)}\n`, "utf8");
    } catch (cause) {
      requestTermination(CODEX_APP_SERVER_TERMINATION_REASONS.ProcessError, cause);
      throw createCodexAppServerProcessError(
        "codex app-server stdin write failed",
        cause,
        true,
        true,
      );
    }
  };

  const closeInput = (): void => {
    if (isSettled() || child.stdin === null || child.stdin.destroyed) return;
    try {
      child.stdin.end();
    } catch (cause) {
      requestTermination(CODEX_APP_SERVER_TERMINATION_REASONS.ProcessError, cause);
    }
  };

  const handleProtocolFailure = (
    error: unknown,
    reason: CODEX_APP_SERVER_TERMINATION_REASONS = CODEX_APP_SERVER_TERMINATION_REASONS.ProtocolError,
  ): void => {
    if (getTransportFailure() === null && error !== null && error !== undefined) {
      setTransportFailure(asCodexAppServerError(error, "codex app-server protocol failed"));
    }
    requestTermination(reason);
  };

  return {
    io: {
      send,
      closeInput,
      requestTermination: (reason) => requestTermination(reason),
    },
    handleProtocolFailure,
  };
}
