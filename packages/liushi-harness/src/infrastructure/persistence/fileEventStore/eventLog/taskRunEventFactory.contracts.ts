import type { ActorRef, IdGenerator } from "#common/index.js";
import type { ApprovalRecordedPayload, ArtifactCommittedPayload } from "#domain/taskRun/index.js";
import type { TaskId } from "#domain/task/index.js";
import type { WorkspaceId } from "#domain/workspace/index.js";

/** 新建 Task Run Event 所需的公共尾部与身份输入。 */
export interface TaskRunEventFactoryInput {
  /** Event 所属 Workspace。 */
  workspaceId: WorkspaceId;
  /** Event 所属 Task。 */
  taskId: TaskId;
  /** 新 Event 的严格递增 Sequence。 */
  sequence: number;
  /** 当前 Event 绑定的上一条 Hash。 */
  previousHash: string;
  /** Event 发生时间。 */
  occurredAt: string;
  /** 触发 Event 的 Actor。 */
  actor: ActorRef;
  /** Event ID 生成器。 */
  eventIdGenerator: IdGenerator;
}

/** 创建 ArtifactCommitted Event 的输入。 */
export interface ArtifactCommittedEventFactoryInput extends TaskRunEventFactoryInput {
  /** Artifact、Gate Evaluation 和可选 DecisionRequest。 */
  payload: ArtifactCommittedPayload;
}

/** 创建 ApprovalRecorded Event 的输入。 */
export interface ApprovalRecordedEventFactoryInput extends TaskRunEventFactoryInput {
  /** Approval 与重算后的 Gate Evaluation。 */
  payload: ApprovalRecordedPayload;
}
