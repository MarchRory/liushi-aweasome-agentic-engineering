import type { CodexAppServerThreadStatusTransition } from "../contracts/index.js";
import {
  CODEX_APP_SERVER_THREAD_ACTIVE_FLAGS,
  CODEX_APP_SERVER_THREAD_STATUS,
} from "../enums/index.js";

/** Codex App Server 强制使用的参数尾部。 */
export const CODEX_APP_SERVER_ARGUMENT_TAIL = Object.freeze([
  "--strict-config",
  "app-server",
  "--stdio",
] as const);

/** Codex App Server 的默认资源限制。 */
export const CODEX_APP_SERVER_DEFAULTS = Object.freeze({
  /** 默认执行超时时间，单位为毫秒。 */
  TimeoutMs: 30_000,
  /** 默认标准输出字节上限。 */
  OutputLimitBytes: 1_024 * 1_024,
  /** 默认标准错误字节上限。 */
  StderrLimitBytes: 64 * 1_024,
  /** 默认终止确认等待时间，单位为毫秒。 */
  TerminationConfirmationTimeoutMs: 1_000,
});

/** 进程树终止策略的默认等待时间。 */
export const CODEX_APP_SERVER_PROCESS_TERMINATION_DEFAULTS = Object.freeze({
  /** 首次终止信号后的宽限时间，单位为毫秒。 */
  GracePeriodMs: 500,
  /** 强制终止后的最终等待时间，单位为毫秒。 */
  ForcePeriodMs: 3_000,
});

/** 当前协议兼容所需的客户端身份。 */
export const CODEX_APP_SERVER_CLIENT_INFO = Object.freeze({
  /** 客户端短名称。 */
  name: "liushi-harness",
  /** 客户端显示名称。 */
  title: "liushi-harness",
  /** 客户端兼容版本。 */
  version: "0.0.0",
});

/** 已验证的四段线程状态序列。 */
export const CODEX_APP_SERVER_REQUIRED_THREAD_STATUS_TRANSITIONS: readonly CodexAppServerThreadStatusTransition[] =
  Object.freeze([
    Object.freeze({
      type: CODEX_APP_SERVER_THREAD_STATUS.Active,
      activeFlags: Object.freeze([]),
    }),
    Object.freeze({
      type: CODEX_APP_SERVER_THREAD_STATUS.Active,
      activeFlags: Object.freeze([CODEX_APP_SERVER_THREAD_ACTIVE_FLAGS.WaitingOnApproval]),
    }),
    Object.freeze({
      type: CODEX_APP_SERVER_THREAD_STATUS.Active,
      activeFlags: Object.freeze([]),
    }),
    Object.freeze({
      type: CODEX_APP_SERVER_THREAD_STATUS.Idle,
    }),
  ]);
