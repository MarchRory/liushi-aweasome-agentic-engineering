import type { ARTIFACT_SCHEMA_VERSION, ActorRef } from "#common/index.js";
import type { Claim, EvidenceRef } from "#domain/evidence/index.js";
import type { GateId, RiskLevel } from "#domain/policy/index.js";
import type { TaskId } from "#domain/task/index.js";
import type { WorkspaceId } from "#domain/workspace/index.js";

import type { ArtifactDigest } from "./artifactDigest.js";
import type { ArtifactId } from "./artifactId.js";
import type { ArtifactStatus, ArtifactType } from "./artifactEnums.js";

/** Artifact Envelope 对 Payload 及其身份、版本、来源和摘要的绑定。 */
export interface ArtifactEnvelope<TType extends ArtifactType, TPayload> {
  /** Artifact Envelope Schema Version。 */
  schemaVersion: typeof ARTIFACT_SCHEMA_VERSION;
  /** Artifact 的稳定 ULID。 */
  artifactId: ArtifactId;
  /** Artifact Payload 的封闭类型。 */
  artifactType: TType;
  /** Artifact 所属 Workspace。 */
  workspaceId: WorkspaceId;
  /** Artifact 所属 Task。 */
  taskId: TaskId;
  /** 同一 Artifact 内严格递增的 Revision。 */
  revision: number;
  /** 上一个 Revision 的 Digest；首个 Revision 不存在。 */
  parentDigest?: ArtifactDigest;
  /** Artifact 当前生命周期状态。 */
  status: ArtifactStatus;
  /** Artifact Revision 创建时间的 ISO 8601 UTC 字符串。 */
  createdAt: string;
  /** 创建该 Artifact Revision 的 Human、Agent 或 System Actor。 */
  createdBy: ActorRef;
  /** Artifact 规范化内容的 SHA-256 Digest。 */
  digest: ArtifactDigest;
  /** Artifact 承载的严格 Payload。 */
  payload: TPayload;
}

/** 已提交 Requirement Contract Artifact。 */
export type RequirementContractArtifact = ArtifactEnvelope<
  ArtifactType.RequirementContract,
  RequirementContractPayload
>;

/** 已提交 Business Logic Change Contract Artifact。 */
export type BusinessLogicChangeContractArtifact = ArtifactEnvelope<
  ArtifactType.BusinessLogicChangeContract,
  BusinessLogicChangeContractPayload
>;

/** 已提交 PlanRisk Artifact。 */
export type PlanRiskArtifact = ArtifactEnvelope<ArtifactType.PlanRisk, PlanRiskPayload>;

/** 当前 Harness 切片支持的正式 Artifact union。 */
export type SupportedArtifact =
  RequirementContractArtifact | BusinessLogicChangeContractArtifact | PlanRiskArtifact;

/** 计算 Artifact Digest 时排除 digest 字段的规范输入。 */
export type ArtifactDigestInput<TArtifact extends SupportedArtifact = SupportedArtifact> =
  TArtifact extends SupportedArtifact ? Omit<TArtifact, "digest"> : never;

/** 跨 Artifact 引用所需的最小稳定信息。 */
export interface ArtifactReference {
  /** 被引用 Artifact 的稳定 ULID。 */
  artifactId: ArtifactId;
  /** 被引用 Artifact 的封闭类型。 */
  artifactType: ArtifactType;
  /** 被引用 Artifact 的 Revision。 */
  revision: number;
  /** 被引用 Artifact 的生命周期状态。 */
  status: ArtifactStatus;
  /** 被引用 Artifact 的 SHA-256 Digest。 */
  digest: ArtifactDigest;
}

/** Requirement Contract 的严格 Payload。 */
export interface RequirementContractPayload {
  /** 当前任务要解决的问题。 */
  problem: string;
  /** 当前任务明确追求的目标。 */
  goals: readonly string[];
  /** 当前任务明确不追求的目标。 */
  nonGoals: readonly string[];
  /** 可观察行为层面的验收描述。 */
  observableBehaviors: readonly string[];
  /** 可执行或可检查的验收标准。 */
  acceptanceCriteria: readonly string[];
  /** 当前任务允许包含的范围。 */
  includedScopes: readonly string[];
  /** 当前任务禁止触碰的范围。 */
  forbiddenScopes: readonly string[];
  /** 当前任务涉及的仓库标识。 */
  repositories: readonly string[];
  /** 已识别的边界场景。 */
  edgeCases: readonly string[];
  /** 兼容性约束和不可破坏的行为。 */
  compatibilityConstraints: readonly string[];
  /** 支撑需求契约的证据。 */
  evidence: readonly EvidenceRef[];
  /** 需求契约中的声明。 */
  claims: readonly Claim[];
  /** 尚未确认但已显式记录的问题。 */
  unknowns: readonly string[];
  /** Human 已回答并纳入契约的问题。 */
  humanAnswers: readonly string[];
}

/** 业务逻辑当前行为的事实与推断。 */
export interface BusinessLogicCurrentBehavior {
  /** 已有业务逻辑中可被证据支撑的事实。 */
  facts: readonly Claim[];
  /** 基于事实推导出的当前行为判断。 */
  inferences: readonly Claim[];
}

/** Business Logic Change Contract 的严格 Payload。 */
export interface BusinessLogicChangeContractPayload {
  /** 变更前业务逻辑的事实与推断。 */
  currentBehavior: BusinessLogicCurrentBehavior;
  /** 变更后计划呈现的业务行为。 */
  plannedBehavior: readonly string[];
  /** 新旧业务行为之间的差异。 */
  differences: readonly string[];
  /** 可能受到影响的调用方、用户或系统。 */
  affectedConsumers: readonly string[];
  /** 变更后必须保持成立的不变量。 */
  invariants: readonly string[];
  /** 业务逻辑变更的回退方式。 */
  rollback: readonly string[];
  /** 支撑业务逻辑契约的证据。 */
  evidence: readonly EvidenceRef[];
  /** 尚未确认的业务逻辑问题。 */
  unknowns: readonly string[];
}

/** PlanRisk 中的执行步骤。 */
export interface PlanRiskStep {
  /** 步骤的稳定序号。 */
  order: number;
  /** 步骤要完成的动作。 */
  action: string;
}

/** PlanRisk 中的风险条目。 */
export interface PlanRiskItem {
  /** 风险的简短描述。 */
  description: string;
  /** 风险的缓解措施。 */
  mitigation: string;
}

/** PlanRisk 中的风险操作条目。 */
export interface RiskOperation {
  /** 风险操作的路径、命令或资源名称。 */
  target: string;
  /** 该操作为何具有风险。 */
  reason: string;
}

/** PlanRisk 的严格 Payload。 */
export interface PlanRiskPayload {
  /** 计划执行的有序步骤。 */
  steps: readonly PlanRiskStep[];
  /** 计划需要读取的文件、目录或资源。 */
  readSet: readonly string[];
  /** 计划允许写入的文件、目录或资源。 */
  writeSet: readonly string[];
  /** 计划已识别的风险。 */
  risks: readonly PlanRiskItem[];
  /** 计划声明的风险等级。 */
  riskLevel: RiskLevel;
  /** 当前计划是否涉及历史业务逻辑变更。 */
  historicalLogicChange: boolean;
  /** 计划包含的高风险操作。 */
  riskOperations: readonly RiskOperation[];
  /** 计划完成后的验证方案。 */
  testPlan: readonly string[];
  /** 计划失败或回退时的处理方式。 */
  rollbackPlan: readonly string[];
  /** AI 认为需要的 Gate；后续 Core 会重新计算。 */
  requiredGates: readonly GateId[];
  /** 历史业务逻辑变更所绑定的 Business Logic Artifact Digest。 */
  businessLogicArtifactDigest?: ArtifactDigest;
}

/** Requirement Contract Proposal。 */
export interface RequirementContractProposal {
  /** Proposal 的 Artifact 类型 discriminator。 */
  artifactType: ArtifactType.RequirementContract;
  /** Proposal 初始状态，仅允许 Proposed。 */
  status: ArtifactStatus.Proposed;
  /** Requirement Contract 的严格 Payload。 */
  payload: RequirementContractPayload;
}

/** Business Logic Change Contract Proposal。 */
export interface BusinessLogicChangeContractProposal {
  /** Proposal 的 Artifact 类型 discriminator。 */
  artifactType: ArtifactType.BusinessLogicChangeContract;
  /** Proposal 初始状态，仅允许 Proposed。 */
  status: ArtifactStatus.Proposed;
  /** Business Logic Change Contract 的严格 Payload。 */
  payload: BusinessLogicChangeContractPayload;
}

/** PlanRisk Proposal。 */
export interface PlanRiskProposal {
  /** Proposal 的 Artifact 类型 discriminator。 */
  artifactType: ArtifactType.PlanRisk;
  /** Proposal 初始状态，仅允许 Proposed。 */
  status: ArtifactStatus.Proposed;
  /** PlanRisk 的严格 Payload。 */
  payload: PlanRiskPayload;
}

/** 可由下一层 Use Case 接收的 Proposal union。 */
export type ArtifactProposal =
  RequirementContractProposal | BusinessLogicChangeContractProposal | PlanRiskProposal;
