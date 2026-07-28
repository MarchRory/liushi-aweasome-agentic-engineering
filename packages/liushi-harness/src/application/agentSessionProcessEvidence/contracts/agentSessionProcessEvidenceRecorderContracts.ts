import type { ContentDigest, HarnessError, Result } from "#common/index.js";
import type {
  AgentSessionProcessEvidence,
  AgentSessionProcessHostSurface,
  AgentSessionProcessOutcome,
} from "#domain/agentSessionProcessEvidence/index.js";
import type { CodingTaskSessionId } from "#domain/codingTaskSession/index.js";
import type { WorkspaceId } from "#domain/workspace/index.js";
import type {
  AgentSessionProcessEvidenceStore,
  CodingTaskSessionActivationRepository,
  CodingTaskSessionAdmissionStateStore,
} from "#application/ports/index.js";

/** 受信宿主提交的进程事实；身份字段只能由服务注入。 */
export interface RecordAgentSessionProcessEvidenceInput {
  /** 权威 Workspace 定位符。 */
  readonly workspaceId: WorkspaceId;
  /** 权威 Session 定位符。 */
  readonly sessionId: CodingTaskSessionId;
  /** 宿主观测到的执行器 Session 摘要，必须等于 Admission 声明。 */
  readonly claimedExecutorSessionIdDigest: ContentDigest;
  /** 执行器标识。 */
  readonly executorId: string;
  /** 执行器版本。 */
  readonly executorVersion: string;
  /** 已执行文件摘要。 */
  readonly executableDigest: ContentDigest;
  /** 受信宿主表面。 */
  readonly hostSurface: AgentSessionProcessHostSurface;
  /** 模型标识。 */
  readonly modelId: string;
  /** 推理力度。 */
  readonly reasoningEffort: string;
  /** 生效权限模式。 */
  readonly permissionMode: string;
  /** 实际 Prompt 摘要。 */
  readonly promptDigest: ContentDigest;
  /** 生效 Hook 配置摘要。 */
  readonly hookConfigDigest: ContentDigest;
  /** 启动时间。 */
  readonly startedAt: string;
  /** 结束时间。 */
  readonly completedAt: string;
  /** 耗时毫秒。 */
  readonly durationMs: number;
  /** 进程终态。 */
  readonly outcome: AgentSessionProcessOutcome;
  /** 退出码。 */
  readonly exitCode: number | null;
  /** 终止信号。 */
  readonly signal: string | null;
  /** 超时标记。 */
  readonly timedOut: boolean;
}

/** Recorder 的权威依赖。 */
export interface AgentSessionProcessEvidenceRecorderDependencies {
  /** 不可变 Activation 权威记录。 */
  readonly activationRepository: CodingTaskSessionActivationRepository;
  /** Admission 权威状态。 */
  readonly admissionStateStore: CodingTaskSessionAdmissionStateStore;
  /** create-only 证据存储。 */
  readonly evidenceStore: AgentSessionProcessEvidenceStore;
  /** 内容摘要端口。 */
  readonly contentDigest: { calculate(input: unknown): Result<ContentDigest, HarnessError> };
}

/** 记录进程证据的结果。 */
export type RecordAgentSessionProcessEvidenceResult = Result<
  AgentSessionProcessEvidence,
  HarnessError
>;
