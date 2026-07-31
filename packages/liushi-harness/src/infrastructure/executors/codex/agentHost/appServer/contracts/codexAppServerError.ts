import type { CODEX_APP_SERVER_TERMINATION_REASONS } from "../enums/index.js";
import type { CodexAppServerProcessInfo } from "./codexAppServer.contracts.js";
import type { CodexAppServerProtocolEvidence } from "./codexAppServerProtocol.contracts.js";

/** Codex App Server 错误的可选状态字段。 */
export interface CodexAppServerErrorOptions {
  /** 内部原因对象，不进入成功结果摘要。 */
  readonly cause?: unknown;
  /** 是否已启动子进程。 */
  readonly processStarted?: boolean;
  /** 是否仍可能存在未终止的进程。 */
  readonly processMayBeRunning?: boolean;
  /** 是否无法确认进程树已终止。 */
  readonly outcomeUnknown?: boolean;
  /** 是否因超时请求终止。 */
  readonly timedOut?: boolean;
  /** 是否因标准输出限制请求终止。 */
  readonly outputLimitExceeded?: boolean;
  /** 是否因标准错误限制请求终止。 */
  readonly stderrLimitExceeded?: boolean;
  /** 终止请求原因。 */
  readonly terminationReason?: CODEX_APP_SERVER_TERMINATION_REASONS | null;
  /** 协议证据摘要。 */
  readonly protocolEvidence?: CodexAppServerProtocolEvidence | null;
}

/** 带有旧 Runner 状态字段的正式错误对象。 */
export class CodexAppServerError extends Error {
  /** 是否已启动子进程。 */
  public processStarted: boolean;

  /** 是否仍可能存在未终止的进程。 */
  public processMayBeRunning: boolean;

  /** 是否无法确认进程树已终止。 */
  public outcomeUnknown: boolean;

  /** 是否因超时请求终止。 */
  public timedOut: boolean;

  /** 是否因标准输出限制请求终止。 */
  public outputLimitExceeded: boolean;

  /** 是否因标准错误限制请求终止。 */
  public stderrLimitExceeded: boolean;

  /** 终止请求原因。 */
  public terminationReason: CODEX_APP_SERVER_TERMINATION_REASONS | null;

  /** 协议证据摘要。 */
  public protocolEvidence: CodexAppServerProtocolEvidence | null;

  /** 创建带有可选执行状态的 Runner 错误。 */
  public constructor(message: string, options: CodexAppServerErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.processStarted = options.processStarted ?? false;
    this.processMayBeRunning = options.processMayBeRunning ?? false;
    this.outcomeUnknown = options.outcomeUnknown ?? this.processMayBeRunning;
    this.timedOut = options.timedOut ?? false;
    this.outputLimitExceeded = options.outputLimitExceeded ?? false;
    this.stderrLimitExceeded = options.stderrLimitExceeded ?? false;
    this.terminationReason = options.terminationReason ?? null;
    this.protocolEvidence = options.protocolEvidence ?? null;
  }
}

/** 从进程摘要把状态安全附着到正式错误对象。 */
export function attachCodexAppServerProcessState(
  error: CodexAppServerError,
  processInfo: CodexAppServerProcessInfo,
): CodexAppServerError {
  error.processStarted = true;
  error.processMayBeRunning = processInfo.processMayBeRunning;
  error.outcomeUnknown = processInfo.processMayBeRunning;
  error.terminationReason = processInfo.terminationReason;
  error.timedOut = processInfo.timedOut;
  error.outputLimitExceeded = processInfo.outputLimitExceeded;
  error.stderrLimitExceeded = processInfo.stderrLimitExceeded;
  error.protocolEvidence = error.protocolEvidence ?? null;
  return error;
}
