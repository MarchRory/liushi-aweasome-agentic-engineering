import type { ArtifactDigest, ArtifactId } from "#domain/artifact/index.js";
import type { ApprovalId } from "#domain/approval/index.js";
import type { GateEvaluationResult, GateId, RiskLevel } from "#domain/policy/index.js";

import type { GateReason } from "./gateReason.js";

/** Gate Engine 对当前 Artifact 的确定性聚合评估。 */
export interface GateEvaluation {
  /** Gate 对当前 Artifact 或 Plan 的判定。 */
  result: GateEvaluationResult;
  /** 评估时使用的风险等级。 */
  riskLevel: RiskLevel;
  /** Gate 评估绑定的 Artifact ID。 */
  artifactId: ArtifactId;
  /** Gate 评估绑定的 Artifact Digest。 */
  artifactDigest: ArtifactDigest;
  /** 当前动作必须满足的全部 Gate。 */
  requiredGates: readonly GateId[];
  /** 已匹配当前 Artifact 与 Decision Digest 的 Approval。 */
  satisfiedApprovals: readonly ApprovalId[];
  /** 解释评估结果的稳定原因列表。 */
  reasons: readonly GateReason[];
  /** 支撑风险和 Gate 判断的 Evidence ID。 */
  evidenceIds: readonly string[];
  /** 产生该评估的 ISO 时间。 */
  evaluatedAt: string;
}
