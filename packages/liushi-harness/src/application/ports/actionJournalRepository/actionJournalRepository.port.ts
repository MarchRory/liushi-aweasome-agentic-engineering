import type { HarnessError, Result } from "#common/index.js";
import type {
  ActionIntentRecord,
  ActionJournalState,
  ActionObservationRecord,
  ActionResolutionRecord,
} from "#domain/actionJournal/index.js";

import type {
  ActionJournalLocator,
  ActionJournalMutationOutput,
  TaskActionJournalLocator,
} from "./actionJournalRepository.contracts.js";

/** Action Journal 的持久化、重放和恢复查询 Port。 */
export interface ActionJournalRepository {
  /** 幂等创建并持久化 Action Intent。 */
  createIntent(
    intent: ActionIntentRecord,
  ): Promise<Result<ActionJournalMutationOutput, HarnessError>>;
  /** 在当前 Action 状态后追加 Observation。 */
  appendObservation(
    observation: ActionObservationRecord,
  ): Promise<Result<ActionJournalMutationOutput, HarnessError>>;
  /** 在最新 Observation 后追加 Resolution。 */
  appendResolution(
    resolution: ActionResolutionRecord,
  ): Promise<Result<ActionJournalMutationOutput, HarnessError>>;
  /** 重放一个 Action 的完整 Journal State。 */
  load(locator: ActionJournalLocator): Promise<Result<ActionJournalState, HarnessError>>;
  /** 返回 Task 中全部尚未进入终态的 Action。 */
  listRecoverable(
    locator: TaskActionJournalLocator,
  ): Promise<Result<readonly ActionJournalState[], HarnessError>>;
}
