import type { ActorRef } from "#common/index.js";

/** ProposeArtifact Use Case 的外部输入。 */
export interface ProposeArtifactInput {
  /** 目标 Workspace ID。 */
  workspaceId: string;
  /** 目标 Task ID。 */
  taskId: string;
  /** 尚未信任的 Artifact Proposal JSON。 */
  proposal: unknown;
  /** 提交 Proposal 的 Human 或 Agent Actor。 */
  actor: ActorRef;
  /** 调用方提供的稳定幂等键；缺省时保持旧版一次性提交语义。 */
  idempotencyKey?: string;
}
