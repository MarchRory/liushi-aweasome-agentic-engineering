import type { ActionJournalState } from "#domain/actionJournal/index.js";
import type { CodingTaskAggregate } from "#domain/codingTask/index.js";

import type { WorktreeProvisionRecoveryAssessment } from "../../contracts/index.js";

/** 应用层内部使用的完整 Worktree Provision 恢复评估。 */
export interface WorktreeProvisionRecoveryAssessmentInternal {
  /** 向 Human 暴露的脱敏评估。 */
  readonly assessment: WorktreeProvisionRecoveryAssessment;
  /** 评估时重新加载的权威 CodingTask。 */
  readonly aggregate: CodingTaskAggregate;
  /** 评估时重新加载的权威 Action Journal。 */
  readonly journal: ActionJournalState;
}
