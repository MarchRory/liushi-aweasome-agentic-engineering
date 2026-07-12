import type {
  LockReleaseStatus,
  ParentDirectorySyncStatus,
  PersistenceHealth,
} from "../taskRepository/index.js";
import type { ActionId, ActionJournalState } from "#domain/actionJournal/index.js";
import type { TaskId } from "#domain/task/index.js";
import type { WorkspaceId } from "#domain/workspace/index.js";

import type { ActionJournalMutationDisposition } from "./actionJournalRepository.enums.js";

/** 定位一个 Workspace Task 内 Action Journal 的稳定键。 */
export interface ActionJournalLocator {
  /** Action 所属 Workspace。 */
  readonly workspaceId: WorkspaceId;
  /** Action 所属 Task。 */
  readonly taskId: TaskId;
  /** Action 的稳定 ULID。 */
  readonly actionId: ActionId;
}

/** 定位一个 Task 的全部 Action Journal。 */
export interface TaskActionJournalLocator {
  /** Action Journal 所属 Workspace。 */
  readonly workspaceId: WorkspaceId;
  /** Action Journal 所属 Task。 */
  readonly taskId: TaskId;
}

/** Action Journal Record 提交后的持久化健康信息。 */
export interface ActionJournalPersistenceOutcome {
  /** 汇总持久化健康状态。 */
  readonly overall: PersistenceHealth;
  /** Action Journal Lock 释放状态。 */
  readonly actionLock: LockReleaseStatus;
  /** Journal 文件父目录刷新状态。 */
  readonly journalDirectory: ParentDirectorySyncStatus;
  /** 需要显式恢复的规范路径。 */
  readonly recoveryPaths: readonly string[];
}

/** Action Journal Mutation 成功后的状态和持久化结果。 */
export interface ActionJournalMutationOutput {
  /** Mutation 后的权威 Action Journal State。 */
  readonly state: ActionJournalState;
  /** 本次是实际追加还是幂等复用。 */
  readonly disposition: ActionJournalMutationDisposition;
  /** 实际追加时的持久化健康信息。 */
  readonly persistence?: ActionJournalPersistenceOutcome;
}
