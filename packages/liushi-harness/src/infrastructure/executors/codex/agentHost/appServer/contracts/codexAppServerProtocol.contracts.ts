import type {
  CODEX_APP_SERVER_APPROVAL_DECISIONS,
  CODEX_APP_SERVER_OUTCOMES,
  CODEX_APP_SERVER_TERMINATION_REASONS,
  CODEX_APP_SERVER_THREAD_ACTIVE_FLAGS,
  CODEX_APP_SERVER_THREAD_STATUS,
} from "../enums/index.js";
import type {
  CodexAppServerAuthorizeFileChange,
  CodexAppServerProcessInfo,
  CodexAppServerSpawnProcess,
  CodexAppServerTerminateProcessTree,
} from "./codexAppServer.contracts.js";
import type { CodexAppServerWireMessage } from "./codexAppServerWire.contracts.js";

/** 单次审批响应的规范化审计摘要。 */
export interface CodexAppServerAuthorizationAudit {
  /** 被审查的文件变更 Item 编号。 */
  readonly itemId: string;
  /** 发给 App Server 的审批决策。 */
  readonly decision: CODEX_APP_SERVER_APPROVAL_DECISIONS;
  /** 授权证据的规范 JSON SHA-256 摘要。 */
  readonly evidenceDigest: string;
}

/** 线程状态变化的最小协议形状。 */
export interface CodexAppServerThreadStatusTransition {
  /** 线程状态。 */
  readonly type: CODEX_APP_SERVER_THREAD_STATUS;
  /** active 状态携带的受限活动标记。 */
  readonly activeFlags?: readonly CODEX_APP_SERVER_THREAD_ACTIVE_FLAGS[];
}

/** 协议消费后的公开证据摘要。 */
export interface CodexAppServerProtocolEvidence {
  /** 已确认的线程编号。 */
  readonly threadId: string | null;
  /** 已确认的 Turn 编号。 */
  readonly turnId: string | null;
  /** 接收的 JSONL 事件数。 */
  readonly eventCount: number;
  /** 接收的响应数。 */
  readonly responseCount: number;
  /** 接收的服务端请求数。 */
  readonly requestCount: number;
  /** 接收的通知数。 */
  readonly notificationCount: number;
  /** 每个已知方法的接收次数。 */
  readonly methodCounts: Readonly<Record<string, number>>;
  /** 未知方法的数量。 */
  readonly unknownMethodCount: number;
  /** 未知方法名称集合。 */
  readonly unknownMethods: readonly string[];
  /** 已开始 Item 数量。 */
  readonly itemCount: number;
  /** 文件变更 Item 数量。 */
  readonly fileChangeItemCount: number;
  /** 已完成文件变更数量。 */
  readonly completedFileChangeCount: number;
  /** 接受审批数量。 */
  readonly approvedCount: number;
  /** 取消审批数量。 */
  readonly cancelledCount: number;
  /** 审批授权摘要集合。 */
  readonly authorizations: readonly CodexAppServerAuthorizationAudit[];
  /** 线程状态变化序列。 */
  readonly threadStatusTransitions: readonly CodexAppServerThreadStatusTransition[];
  /** 规范化变更集合摘要。 */
  readonly changeDigest: string;
}

/** Runner 对外返回的结果。 */
export interface CodexAppServerResult {
  /** 执行结果分类。 */
  outcome: CODEX_APP_SERVER_OUTCOMES;
  /** 子进程摘要。 */
  process: CodexAppServerProcessInfo;
  /** 协议摘要。 */
  protocolEvidence: CodexAppServerProtocolEvidence;
}

/** 保留旧 Runner status 字段的正式结果。 */
export interface CodexAppServerRunnerResult extends CodexAppServerResult {
  /** 与 outcome 始终相同的兼容状态。 */
  readonly status: CODEX_APP_SERVER_OUTCOMES;
}

/** 协议层写入和终止进程所需的 IO。 */
export interface CodexAppServerIo {
  /** 向子进程写入一条 JSON-RPC 消息。 */
  send(message: CodexAppServerWireMessage): void;
  /** 关闭子进程标准输入。 */
  closeInput(): void;
  /** 请求进程层终止子进程。 */
  requestTermination(reason: CODEX_APP_SERVER_TERMINATION_REASONS): void;
}

/** App Server 协议实现的公开操作。 */
export interface CodexAppServerProtocol {
  /** 发送初始化请求并开始协议。 */
  start(): void;
  /** 消费一行 JSONL 消息。 */
  handleLine(line: string): Promise<void>;
  /** 记录协议失败并请求进程层终止。 */
  fail(error: unknown, reason?: CODEX_APP_SERVER_TERMINATION_REASONS): void;
  /** 因进程限制中止协议消费。 */
  abort(reason: CODEX_APP_SERVER_TERMINATION_REASONS): void;
  /** 在进程关闭后收口协议结果。 */
  finalize(processInfo: CodexAppServerProcessInfo): CodexAppServerResult;
  /** 返回不含 Prompt、Diff 和正文的协议证据。 */
  getEvidence(): CodexAppServerProtocolEvidence;
  /** 返回协议层正式错误。 */
  getFailure(): Error | null;
  /** 返回协议已确定的结果。 */
  getOutcome(): CODEX_APP_SERVER_OUTCOMES | null;
  /** 返回是否发生策略拒绝。 */
  getPolicyDenied(): boolean;
}

/** 创建协议实例的工厂函数。 */
export type CodexAppServerProtocolFactory = (io: CodexAppServerIo) => CodexAppServerProtocol;

/** 兼容直接注入协议实例和按 IO 延迟创建协议两种方式。 */
export type CodexAppServerProtocolProvider = CodexAppServerProtocol | CodexAppServerProtocolFactory;

/** Runner 的可注入依赖。 */
export interface CodexAppServerRunnerOverrides {
  /** 覆盖输入中的文件变更授权回调。 */
  readonly authorizeFileChange?: CodexAppServerAuthorizeFileChange;
  /** 覆盖默认的子进程启动器。 */
  readonly spawnProcess?: CodexAppServerSpawnProcess;
  /** 覆盖默认的进程树终止器。 */
  readonly terminateProcessTree?: CodexAppServerTerminateProcessTree;
}
