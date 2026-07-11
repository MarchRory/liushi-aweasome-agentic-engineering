import type { TaskPersistenceOutcome } from "#application/ports/index.js";
import type { ApprovalRecord } from "#domain/approval/index.js";
import type { GateEvaluation } from "#domain/gate/index.js";
import type { TaskState } from "#domain/task/index.js";

import type { ApprovalRecordDisposition } from "./recordApproval.enums.js";

/** Human Approval 被记录或幂等复用后的结果。 */
export interface RecordApprovalOutput {
  /** 已持久化且绑定精确 DecisionRequest Digest 的 Approval。 */
  approval: ApprovalRecord;
  /** 纳入该 Approval 后由 Core 重算的 Gate 结果。 */
  gateEvaluation: GateEvaluation;
  /** 当前权威 Event Replay 得到的 Task State。 */
  task: TaskState;
  /** 本次调用是新记录还是幂等复用。 */
  disposition: ApprovalRecordDisposition;
  /** 仅在提交新 Event 时存在的持久化健康信息。 */
  persistence?: TaskPersistenceOutcome;
}
