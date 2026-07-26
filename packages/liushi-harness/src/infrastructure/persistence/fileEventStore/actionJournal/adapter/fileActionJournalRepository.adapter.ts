import {
  isDurableParentDirectorySyncStatus,
  LockReleaseStatus,
  PersistenceHealth,
  type ActionJournalLocator,
  type ActionJournalMutationOutput,
  type ActionJournalRepository,
  type TaskActionJournalLocator,
} from "#application/index.js";
import { HarnessError, ResultStatus, failure, success, type Result } from "#common/index.js";
import {
  ActionJournalStatus,
  parseActionIntent,
  parseActionObservation,
  parseActionResolution,
  type ActionId,
  type ActionIntentRecord,
  type ActionJournalRecord,
  type ActionJournalState,
  type ActionObservationRecord,
  type ActionResolutionRecord,
} from "#domain/actionJournal/index.js";

import {
  releaseLockBestEffort,
  syncParentDirectoryBestEffort,
} from "../../commitRecovery/index.js";
import type { TaskStorePaths } from "../../contracts/index.js";
import { createTaskNotFoundError, toFileEventStoreError } from "../../errors/index.js";
import type { ExclusiveFileLockHandle } from "../../lock/index.js";
import { pathExists, resolveTaskStorePaths } from "../../taskStore/index.js";
import {
  ActionJournalHandleStatus,
  type FileActionJournalRepositoryDependencies,
} from "../contracts/index.js";
import {
  appendActionJournalRecord,
  createActionJournalFileRecord,
  readActionJournalRecords,
} from "../io/index.js";
import { replayActionJournals } from "../replay/index.js";
import {
  actionNotFound,
  planIntentCreation,
  planObservationAppend,
  planResolutionAppend,
  type ActionMutationPlan,
} from "./actionJournalMutationPlan.js";

/** 使用 Task 级 actions.jsonl 和独立 Action Lock 实现 Action Journal Repository。 */
export class FileActionJournalRepository implements ActionJournalRepository {
  public constructor(
    private readonly storeRoot: string,
    private readonly dependencies: FileActionJournalRepositoryDependencies,
  ) {}

  /** 幂等追加 Action Intent。 */
  public async createIntent(
    input: ActionIntentRecord,
  ): Promise<Result<ActionJournalMutationOutput, HarnessError>> {
    const parsed = parseActionIntent(input);
    if (parsed.status === ResultStatus.Failure) {
      return parsed;
    }
    const intent = parsed.value;
    return this.mutate(intent, (_records, states) => planIntentCreation(states, intent));
  }

  /** 幂等追加 Action Observation。 */
  public async appendObservation(
    input: ActionObservationRecord,
  ): Promise<Result<ActionJournalMutationOutput, HarnessError>> {
    const parsed = parseActionObservation(input);
    return parsed.status === ResultStatus.Failure
      ? parsed
      : this.mutate(parsed.value, (records, states) =>
          planObservationAppend(records, states, parsed.value),
        );
  }

  /** 幂等追加 Action Resolution。 */
  public async appendResolution(
    input: ActionResolutionRecord,
  ): Promise<Result<ActionJournalMutationOutput, HarnessError>> {
    const parsed = parseActionResolution(input);
    return parsed.status === ResultStatus.Failure
      ? parsed
      : this.mutate(parsed.value, (records, states) =>
          planResolutionAppend(records, states, parsed.value),
        );
  }

  /** 在独立 Action Lock 内重放一个 Action。 */
  public load(locator: ActionJournalLocator): Promise<Result<ActionJournalState, HarnessError>> {
    return this.readLocked(locator, (states) => {
      const state = states.get(locator.actionId);
      return state === undefined ? failure(actionNotFound(locator.actionId)) : success(state);
    });
  }

  /** 返回全部非终态 Action，供恢复命令和 Tracker 查询。 */
  public listRecoverable(
    locator: TaskActionJournalLocator,
  ): Promise<Result<readonly ActionJournalState[], HarnessError>> {
    return this.readLocked(locator, (states) =>
      success(
        [...states.values()]
          .filter(
            (state) =>
              state.status !== ActionJournalStatus.Committed &&
              state.status !== ActionJournalStatus.Recovered,
          )
          .sort((left, right) => left.intent.actionId.localeCompare(right.intent.actionId)),
      ),
    );
  }

  private async mutate(
    recordScope: ActionJournalRecord,
    plan: (
      records: readonly ActionJournalRecord[],
      states: ReadonlyMap<ActionId, ActionJournalState>,
    ) => Result<ActionMutationPlan, HarnessError>,
  ): Promise<Result<ActionJournalMutationOutput, HarnessError>> {
    const paths = resolveTaskStorePaths(
      this.storeRoot,
      recordScope.workspaceId,
      recordScope.taskId,
    );
    const lock = await this.acquire(paths);
    if (lock.status === ResultStatus.Failure) {
      return lock;
    }

    try {
      await assertTaskExists(paths);
      const fileRecords = await readActionJournalRecords(paths.actionsFile);
      const records = fileRecords.map((entry) => entry.record);
      const states = replayActionJournals(records, paths.workspaceId, paths.taskId);
      const planned = plan(records, states);
      if (planned.status === ResultStatus.Failure) {
        return this.failBeforeCommit(planned.error, paths, lock.value);
      }
      if (planned.value.record === undefined) {
        return this.completeReadOnlyMutation(planned.value, paths, lock.value);
      }

      const commit = await appendActionJournalRecord(
        paths.actionsFile,
        createActionJournalFileRecord(planned.value.record, fileRecords.at(-1)),
      );
      return this.completeCommittedMutation(planned.value, commit.handle, paths, lock.value);
    } catch (error) {
      return this.failBeforeCommit(
        toFileEventStoreError(error, "Action Journal Mutation 失败。", paths),
        paths,
        lock.value,
      );
    }
  }

  private async readLocked<T>(
    locator: TaskActionJournalLocator,
    project: (states: ReadonlyMap<ActionId, ActionJournalState>) => Result<T, HarnessError>,
  ): Promise<Result<T, HarnessError>> {
    const paths = resolveTaskStorePaths(this.storeRoot, locator.workspaceId, locator.taskId);
    const lock = await this.acquire(paths);
    if (lock.status === ResultStatus.Failure) {
      return lock;
    }
    let result: Result<T, HarnessError>;
    try {
      await assertTaskExists(paths);
      const fileRecords = await readActionJournalRecords(paths.actionsFile);
      result = project(
        replayActionJournals(
          fileRecords.map((entry) => entry.record),
          paths.workspaceId,
          paths.taskId,
        ),
      );
    } catch (error) {
      result = failure(toFileEventStoreError(error, "Action Journal 读取失败。", paths));
    }
    try {
      await lock.value.release();
    } catch (error) {
      return failure(toFileEventStoreError(error, "Action Journal Lock 释放失败。", paths));
    }
    return result;
  }

  private async acquire(
    paths: TaskStorePaths,
  ): Promise<Result<ExclusiveFileLockHandle, HarnessError>> {
    try {
      return success(
        await this.dependencies.lockManager.acquire(paths.actionsLockFile, {
          workspaceId: paths.workspaceId,
          taskId: paths.taskId,
        }),
      );
    } catch (error) {
      return failure(toFileEventStoreError(error, "Action Journal Lock 获取失败。", paths));
    }
  }

  private async failBeforeCommit<T>(
    error: HarnessError,
    paths: TaskStorePaths,
    lock: ExclusiveFileLockHandle,
  ): Promise<Result<T, HarnessError>> {
    const released = await releaseLockBestEffort(lock);
    return released === LockReleaseStatus.Released
      ? failure(error)
      : failure(
          new HarnessError(
            error.code,
            error.message,
            { ...error.details, recoveryPaths: paths.actionsLockFile },
            error,
          ),
        );
  }

  private async completeReadOnlyMutation(
    plan: ActionMutationPlan,
    paths: TaskStorePaths,
    lock: ExclusiveFileLockHandle,
  ): Promise<Result<ActionJournalMutationOutput, HarnessError>> {
    try {
      await lock.release();
      return success({ state: plan.state, disposition: plan.disposition });
    } catch (error) {
      return failure(toFileEventStoreError(error, "Action Journal Lock 释放失败。", paths));
    }
  }

  private async completeCommittedMutation(
    plan: ActionMutationPlan,
    handle: ActionJournalHandleStatus,
    paths: TaskStorePaths,
    lock: ExclusiveFileLockHandle,
  ): Promise<Result<ActionJournalMutationOutput, HarnessError>> {
    const journalDirectory = await syncParentDirectoryBestEffort(
      this.dependencies.parentDirectoryDurability,
      paths.actionsFile,
    );
    const recoveryPaths: string[] = [];
    if (handle === ActionJournalHandleStatus.RecoveryRequired) {
      recoveryPaths.push(paths.actionsFile);
    }
    const actionLock = await releaseLockBestEffort(lock);
    if (actionLock === LockReleaseStatus.RecoveryRequired) {
      recoveryPaths.push(paths.actionsLockFile);
    }
    const overall =
      actionLock === LockReleaseStatus.Released &&
      isDurableParentDirectorySyncStatus(journalDirectory) &&
      recoveryPaths.length === 0
        ? PersistenceHealth.Healthy
        : PersistenceHealth.Degraded;

    return success({
      state: plan.state,
      disposition: plan.disposition,
      persistence: {
        overall,
        actionLock,
        journalDirectory,
        recoveryPaths,
      },
    });
  }
}

async function assertTaskExists(paths: TaskStorePaths): Promise<void> {
  if (!(await pathExists(paths.eventsFile))) {
    throw createTaskNotFoundError(paths);
  }
}
