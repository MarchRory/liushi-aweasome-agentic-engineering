import type { CodingTaskSessionEffectiveCloseoutSource } from "#application/codingTaskSessionCloseoutRecovery/index.js";
import type { CommandEnvelope } from "#application/command/index.js";
import type { ContentDigest } from "#common/index.js";
import type { CodingTaskId } from "#domain/codingTask/index.js";
import type { CodingTaskSessionId } from "#domain/codingTaskSession/index.js";
import type { WorkspaceId } from "#domain/workspace/index.js";

/** 将 Effective Closeout 接纳为 CodingTask Submission 的精确 Payload。 */
export interface CodingTaskSessionDeliverySubmissionCommandPayload {
  /** Harness Workspace 标识。 */
  readonly workspaceId: WorkspaceId;
  /** 已完成 Closeout 的 CodingTask Session 标识。 */
  readonly sessionId: CodingTaskSessionId;
  /** 调用方已读取并明确绑定的 Effective Checkpoint 摘要。 */
  readonly expectedCheckpointBindingDigest: ContentDigest;
  /** 调用方已读取并明确绑定的 Effective Checkpoint 来源。 */
  readonly expectedEffectiveSource: CodingTaskSessionEffectiveCloseoutSource;
}

/** 严格解析后的 Session Delivery Submission Command。 */
export type CodingTaskSessionDeliverySubmissionCommand = Omit<
  CommandEnvelope<CodingTaskSessionDeliverySubmissionCommandPayload>,
  "aggregateId"
> & {
  /** 已解析并品牌化的 CodingTask 标识。 */
  readonly aggregateId: CodingTaskId;
};
