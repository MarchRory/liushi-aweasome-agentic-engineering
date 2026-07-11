import type { ActorRef } from "#common/index.js";

/** RecordApproval Use Case 的外部输入。 */
export interface RecordApprovalInput {
  /** 目标 Workspace ID。 */
  workspaceId: string;
  /** 目标 Task ID。 */
  taskId: string;
  /** Human 正在响应的 DecisionRequest ID。 */
  decisionRequestId: string;
  /** Human 已审阅内容对应的 DecisionRequest Digest。 */
  decisionRequestDigest: string;
  /** 调用方生成的稳定幂等键。 */
  idempotencyKey: string;
  /** 作出决策的 Human Actor。 */
  actor: ActorRef;
  /** 尚未信任、将在 Use Case 边界解析为 ApprovalDecision 的决策值。 */
  decision: unknown;
  /** 拒绝或豁免时必填的决策原因。 */
  reason?: string;
}
