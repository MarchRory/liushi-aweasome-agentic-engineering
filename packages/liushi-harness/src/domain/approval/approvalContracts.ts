import type {
  APPROVAL_RECORD_SCHEMA_VERSION,
  DECISION_REQUEST_SCHEMA_VERSION,
  ActorRef,
} from "#common/index.js";
import type { ArtifactDigest, ArtifactId } from "#domain/artifact/index.js";
import type { GateId, RiskLevel } from "#domain/policy/index.js";
import type { TaskId, TaskPhase } from "#domain/task/index.js";

import type { ApprovalId, DecisionRequestId } from "./approvalId.js";
import type { ApprovalDecision } from "./approvalEnums.js";

/** Human 决策前由 Core 创建的请求。 */
export interface DecisionRequest {
  /** Decision Request schema 版本。 */
  schemaVersion: typeof DECISION_REQUEST_SCHEMA_VERSION;
  /** Decision Request 的稳定 ULID。 */
  decisionRequestId: DecisionRequestId;
  /** 该决策请求绑定的 Task ID。 */
  taskId: TaskId;
  /** 触发 Human 决策的 Gate。 */
  gate: GateId;
  /** 该决策请求绑定的 Artifact ID。 */
  artifactId: ArtifactId;
  /** 该决策请求绑定的 Artifact Digest。 */
  artifactDigest: ArtifactDigest;
  /** 请求创建时的风险等级。 */
  riskLevel: RiskLevel;
  /** Human 决策后允许恢复的任务阶段。 */
  resumePhase: TaskPhase;
  /** Human 决策后恢复执行所需的检查点。 */
  resumeCheckpoint: string;
  /** Human 必须完成或确认的动作。 */
  requiredAction: string;
  /** 可选的 Write Set Digest，用于绑定待批准写集。 */
  writeSetDigest?: ArtifactDigest;
  /** 可选的基础版本，用于绑定审批时的仓库或运行时状态。 */
  baseRevision?: string;
  /** Decision Request 规范化内容的 Digest。 */
  digest: ArtifactDigest;
  /** Decision Request 创建时间的 ISO 8601 UTC 字符串。 */
  createdAt: string;
  /** 创建该请求的 Human、Agent 或 System Actor。 */
  createdBy: ActorRef;
}

/** Human 决策被记录后的审计条目。 */
export interface ApprovalRecord {
  /** Approval Record schema 版本。 */
  schemaVersion: typeof APPROVAL_RECORD_SCHEMA_VERSION;
  /** Approval Record 的稳定 ULID。 */
  approvalId: ApprovalId;
  /** 被该记录响应的 Decision Request ID。 */
  decisionRequestId: DecisionRequestId;
  /** 被该记录响应的 Decision Request Digest。 */
  decisionRequestDigest: ArtifactDigest;
  /** Approval 直接绑定的 Gate。 */
  gate: GateId;
  /** Approval 直接绑定的 Artifact ID。 */
  artifactId: ArtifactId;
  /** Approval 直接绑定的 Artifact Digest。 */
  artifactDigest: ArtifactDigest;
  /** 幂等写入键，防止重复记录同一人工决策。 */
  idempotencyKey: string;
  /** Human actor 引用；契约层不自行信任该身份。 */
  actor: ActorRef;
  /** Human 给出的封闭决策结果。 */
  decision: ApprovalDecision;
  /** Human 可选填写的决策原因。 */
  reason?: string;
  /** Approval Record 创建的 ISO 时间。 */
  createdAt: string;
  /** Approval Record 规范化内容的 Digest。 */
  digest: ArtifactDigest;
}

/** 计算 DecisionRequest Digest 时排除 digest 字段的规范输入。 */
export type DecisionRequestDigestInput = Omit<DecisionRequest, "digest">;

/** 计算 ApprovalRecord Digest 时排除 digest 字段的规范输入。 */
export type ApprovalRecordDigestInput = Omit<ApprovalRecord, "digest">;
