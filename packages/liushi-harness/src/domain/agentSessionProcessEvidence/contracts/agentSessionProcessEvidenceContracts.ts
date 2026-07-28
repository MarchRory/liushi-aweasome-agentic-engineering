import type { ContentDigest, HarnessError, Result } from "#common/index.js";
import type { CodingTaskId } from "#domain/codingTask/index.js";
import type { CodingTaskSessionId } from "#domain/codingTaskSession/index.js";
import type { TaskId } from "#domain/task/index.js";
import type { WorkspaceId } from "#domain/workspace/index.js";

import type {
  AgentSessionProcessEvidenceSchemaVersion,
  AgentSessionProcessHostSurface,
  AgentSessionProcessOutcome,
} from "../enums/index.js";

/** Agent 进程证据计算摘要所依赖的最小端口。 */
export interface AgentSessionProcessEvidenceDigestPort {
  /** 计算 RFC 8785 内容摘要。 */
  calculate(input: unknown): Result<ContentDigest, HarnessError>;
}

/** 不含 evidenceDigest 的 Agent 会话进程事实与权威身份绑定。 */
export interface AgentSessionProcessEvidenceInput {
  /** 固定 Schema 版本。 */
  readonly schemaVersion: AgentSessionProcessEvidenceSchemaVersion;
  /** 权威 Workspace 标识。 */
  readonly workspaceId: WorkspaceId;
  /** 权威 Session 标识。 */
  readonly sessionId: CodingTaskSessionId;
  /** 权威 CodingTask 标识。 */
  readonly codingTaskId: CodingTaskId;
  /** 权威源 Task 标识。 */
  readonly sourceTaskId: TaskId;
  /** 权威尝试编号。 */
  readonly attemptNumber: number;
  /** 权威 Worktree 标识。 */
  readonly worktreeId: string;
  /** 权威 Worktree 根摘要。 */
  readonly worktreeRootDigest: ContentDigest;
  /** 权威 Activation 绑定摘要。 */
  readonly activationBindingDigest: ContentDigest;
  /** 权威 Admission 会话绑定摘要。 */
  readonly sessionBindingDigest: ContentDigest;
  /** 权威 Admission 声明的执行器会话摘要。 */
  readonly executorSessionIdDigest: ContentDigest;
  /** 可扩展的执行器标识。 */
  readonly executorId: string;
  /** 执行器版本。 */
  readonly executorVersion: string;
  /** 已执行二进制文件摘要。 */
  readonly executableDigest: ContentDigest;
  /** 承载进程的受信宿主表面。 */
  readonly hostSurface: AgentSessionProcessHostSurface;
  /** 执行模型标识。 */
  readonly modelId: string;
  /** 执行器报告的推理力度。 */
  readonly reasoningEffort: string;
  /** 执行器生效的权限模式。 */
  readonly permissionMode: string;
  /** 实际交给执行器的提示词摘要。 */
  readonly promptDigest: ContentDigest;
  /** 实际生效 Hook 配置摘要。 */
  readonly hookConfigDigest: ContentDigest;
  /** 进程启动时间。 */
  readonly startedAt: string;
  /** 进程终止时间。 */
  readonly completedAt: string;
  /** 受信宿主观测的毫秒耗时。 */
  readonly durationMs: number;
  /** 进程终态。 */
  readonly outcome: AgentSessionProcessOutcome;
  /** 仅正常退出路径可用的退出码。 */
  readonly exitCode: number | null;
  /** 仅信号终止路径可用的信号名。 */
  readonly signal: string | null;
  /** 是否由宿主超时机制终止。 */
  readonly timedOut: boolean;
}

/** 可持久化且不可变的 Agent 会话进程证据。 */
export interface AgentSessionProcessEvidence extends AgentSessionProcessEvidenceInput {
  /** 全部规范字段的内容摘要。 */
  readonly evidenceDigest: ContentDigest;
}
