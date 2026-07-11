import type { TaskPersistenceOutcome } from "#application/ports/index.js";
import type { DecisionRequest } from "#domain/approval/index.js";
import type { SupportedArtifact } from "#domain/artifact/index.js";
import type { GateEvaluation } from "#domain/gate/index.js";
import type { TaskState } from "#domain/task/index.js";

/** Artifact Proposal 成功提交后的结果。 */
export interface ProposeArtifactOutput {
  /** 已提交且 Digest 不可变的 Artifact。 */
  artifact: SupportedArtifact;
  /** Core 重算得到的 Gate Evaluation。 */
  gateEvaluation: GateEvaluation;
  /** WaitingHuman 时创建的唯一 DecisionRequest。 */
  decisionRequest?: DecisionRequest;
  /** Event Replay 后的 Task State。 */
  task: TaskState;
  /** Event commit 之后的持久化健康信息。 */
  persistence: TaskPersistenceOutcome;
}
