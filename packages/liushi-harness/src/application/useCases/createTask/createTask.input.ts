import type { ActorRef } from "#common/index.js";

/** 创建 Task Use Case 的输入。 */
export interface CreateTaskInput {
  /** Task 所属 Workspace ID。 */
  workspaceId: string;
  /** 外部 Ticket、URL 或 Human 输入来源。 */
  source?: string;
  /** 发起创建动作的 Actor。 */
  actor: ActorRef;
}
