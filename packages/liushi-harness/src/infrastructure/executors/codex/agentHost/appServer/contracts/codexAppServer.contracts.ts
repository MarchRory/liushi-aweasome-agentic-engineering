import type { ChildProcessWithoutNullStreams } from "node:child_process";

import type {
  CODEX_APP_SERVER_CHANGE_KINDS,
  CODEX_APP_SERVER_ITEM_STATUSES,
  CODEX_APP_SERVER_ITEM_TYPES,
  CODEX_APP_SERVER_TERMINATION_REASONS,
} from "../enums/index.js";

/** 传给 App Server 的环境变量记录。 */
export type CodexAppServerEnvironment = NodeJS.ProcessEnv;

/** App Server 文件变更的规范化结果。 */
export interface CodexAppServerNormalizedChange {
  /** 规范化后的绝对文件路径。 */
  readonly path: string;
  /** 规范化后的变更种类。 */
  readonly kind: CODEX_APP_SERVER_CHANGE_KINDS.Update;
}

/** App Server 文件变更 Item 的规范化结果。 */
export interface CodexAppServerNormalizedFileChangeItem {
  /** 文件变更 Item 编号。 */
  readonly id: string;
  /** 规范化后的固定 Item 类型。 */
  readonly type: CODEX_APP_SERVER_ITEM_TYPES.FileChange;
  /** App Server 报告的 Item 状态。 */
  readonly status: CODEX_APP_SERVER_ITEM_STATUSES | undefined;
  /** 规范化后的文件变更集合。 */
  readonly changes: readonly CodexAppServerNormalizedChange[];
}

/** 交给上层 Human Gate 的文件变更提案。 */
export interface CodexAppServerFileChangeProposal {
  /** 当前线程编号。 */
  readonly threadId: string;
  /** 当前 Turn 编号。 */
  readonly turnId: string;
  /** 当前文件变更 Item 编号。 */
  readonly itemId: string;
  /** 经过 allowlist 校验的文件变更。 */
  readonly changes: readonly CodexAppServerNormalizedChange[];
  /** 固定为空的授权根字段。 */
  readonly grantRoot: null;
}

/** Human Gate 返回的文件变更授权结果。 */
export interface CodexAppServerAuthorization {
  /** 是否明确批准本次文件变更。 */
  readonly approved: boolean;
  /** 批准或拒绝的可规范化审计证据。 */
  readonly evidence?: unknown;
}

/** Human Gate 文件变更授权回调。 */
export type CodexAppServerAuthorizeFileChange = (
  proposal: CodexAppServerFileChangeProposal,
) => CodexAppServerAuthorization | Promise<CodexAppServerAuthorization>;

/** Runner 接收的原始输入。 */
export interface CodexAppServerInput {
  /** Codex 可执行文件的绝对路径。 */
  readonly executable: string;
  /** Codex 启动参数。 */
  readonly arguments: readonly string[];
  /** 发送给 App Server 的 Prompt。 */
  readonly prompt: string;
  /** 请求使用的模型标识。 */
  readonly model: string;
  /** 请求使用的模型提供方标识。 */
  readonly modelProvider: string;
  /** App Server 工作目录的绝对路径。 */
  readonly cwd: string;
  /** Runtime workspace 根目录集合。 */
  readonly runtimeWorkspaceRoots: readonly string[];
  /** 首选允许写入路径集合。 */
  readonly allowedPaths?: readonly string[];
  /** 兼容旧调用方的允许路径别名。 */
  readonly approvedPaths?: readonly string[];
  /** 兼容旧调用方的绝对允许路径别名。 */
  readonly approvedAbsolutePaths?: readonly string[];
  /** 兼容旧调用方的绝对路径别名。 */
  readonly allowedAbsolutePaths?: readonly string[];
  /** 首选隔离环境。 */
  readonly environment?: CodexAppServerEnvironment;
  /** 兼容旧调用方的环境别名。 */
  readonly env?: CodexAppServerEnvironment;
  /** 首选文件变更授权回调。 */
  readonly authorizeFileChange?: CodexAppServerAuthorizeFileChange;
  /** 执行超时时间，单位为毫秒。 */
  readonly timeoutMs?: number;
  /** 标准输出字节上限。 */
  readonly outputLimitBytes?: number;
  /** 兼容旧调用方的标准输出上限别名。 */
  readonly stdoutLimitBytes?: number;
  /** 兼容旧调用方的最大输出上限别名。 */
  readonly maxOutputBytes?: number;
  /** 兼容旧调用方的最大标准输出上限别名。 */
  readonly maxStdoutBytes?: number;
  /** 标准错误字节上限。 */
  readonly stderrLimitBytes?: number;
  /** 兼容旧调用方的最大标准错误上限别名。 */
  readonly maxStderrBytes?: number;
  /** 终止确认等待时间，单位为毫秒。 */
  readonly terminationConfirmationTimeoutMs?: number;
}

/** 已完成输入校验的 Runner 配置。 */
export interface CodexAppServerConfig {
  /** Codex 可执行文件的绝对路径。 */
  readonly executable: string;
  /** 已验证的启动参数。 */
  readonly arguments: readonly string[];
  /** 发送给 App Server 的 Prompt。 */
  readonly prompt: string;
  /** 请求使用的模型标识。 */
  readonly model: string;
  /** 请求使用的模型提供方标识。 */
  readonly modelProvider: string;
  /** App Server 工作目录。 */
  readonly cwd: string;
  /** 规范化后的 Runtime workspace 根目录。 */
  readonly runtimeWorkspaceRoots: readonly string[];
  /** 以路径身份为键的写入 allowlist。 */
  readonly allowedPaths: ReadonlyMap<string, string>;
  /** 传给子进程的隔离环境。 */
  readonly environment: CodexAppServerEnvironment;
  /** 唯一的文件变更授权入口。 */
  readonly authorizeFileChange: CodexAppServerAuthorizeFileChange;
  /** 执行超时时间，单位为毫秒。 */
  readonly timeoutMs: number;
  /** 标准输出字节上限。 */
  readonly outputLimitBytes: number;
  /** 标准错误字节上限。 */
  readonly stderrLimitBytes: number;
  /** 终止确认等待时间，单位为毫秒。 */
  readonly terminationConfirmationTimeoutMs: number;
}

/** 受限启动调用使用的子进程选项。 */
export interface CodexAppServerSpawnOptions {
  /** 子进程工作目录。 */
  readonly cwd: string;
  /** 子进程环境变量。 */
  readonly env: CodexAppServerEnvironment;
  /** 禁止通过 Shell 解释启动参数。 */
  readonly shell: false;
  /** Windows 下隐藏子进程窗口。 */
  readonly windowsHide: true;
  /** 是否创建独立进程组。 */
  readonly detached: boolean;
  /** 仅连接标准输入、输出和错误流。 */
  readonly stdio: readonly ["pipe", "pipe", "pipe"];
}

/** 可注入的 App Server 子进程启动器。 */
export type CodexAppServerSpawnProcess = (
  executable: string,
  arguments_: readonly string[],
  options: CodexAppServerSpawnOptions,
) => ChildProcessWithoutNullStreams;

/** 可注入的 App Server 进程树终止器。 */
export type CodexAppServerTerminateProcessTree = (
  child: ChildProcessWithoutNullStreams,
) => Promise<void>;

/** 子进程与标准流的摘要信息。 */
export interface CodexAppServerProcessInfo {
  /** 是否已经成功启动子进程。 */
  readonly processStarted: boolean;
  /** 是否仍可能存在未终止的进程。 */
  readonly processMayBeRunning: boolean;
  /** 是否无法确认进程树已经终止。 */
  readonly outcomeUnknown: boolean;
  /** 子进程退出码。 */
  readonly exitCode: number | null;
  /** 子进程终止信号。 */
  readonly signal: NodeJS.Signals | null;
  /** 是否因超时请求终止。 */
  readonly timedOut: boolean;
  /** 是否因标准输出限制请求终止。 */
  readonly outputLimitExceeded: boolean;
  /** 是否因标准错误限制请求终止。 */
  readonly stderrLimitExceeded: boolean;
  /** 终止请求原因。 */
  readonly terminationReason: CODEX_APP_SERVER_TERMINATION_REASONS | null;
  /** 已接收的标准输出字节数。 */
  readonly stdoutBytes: number;
  /** 已接收的标准错误字节数。 */
  readonly stderrBytes: number;
  /** 标准输出 SHA-256 十六进制摘要。 */
  readonly stdoutDigest: string;
  /** 标准错误 SHA-256 十六进制摘要。 */
  readonly stderrDigest: string;
}
