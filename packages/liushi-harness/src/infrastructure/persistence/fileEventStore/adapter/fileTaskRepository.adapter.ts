import type {
  TaskEventAppendInput,
  TaskLocator,
  TaskRepository,
  TaskRepositoryAppendOutput,
  TaskRepositoryCreateOutput,
} from "#application/index.js";
import type { HarnessError } from "#common/index.js";
import { ResultStatus, failure, success, type Result } from "#common/index.js";
import type { TaskState } from "#domain/task/index.js";
import type { TaskAggregateRecord } from "#domain/taskRun/index.js";

import type { TaskStorePaths } from "../contracts/index.js";
import { createTaskNotFoundError, toFileEventStoreError } from "../errors/index.js";
import type { ExclusiveFileLockHandle } from "../lock/index.js";
import { appendTaskRunEvent } from "../taskAppend/index.js";
import { loadTaskStore } from "../taskLoading/index.js";
import { createTaskInFileStore, type TaskPersistenceDependencies } from "../taskCreation/index.js";
import { pathExists, resolveTaskStorePaths } from "../taskStore/index.js";

/** FileTaskRepository 构造时注入的可替换持久化依赖。 */
export type FileTaskRepositoryDependencies = TaskPersistenceDependencies;

/** 使用本地 append-only JSONL 和原子 Snapshot 实现 Task Repository。 */
export class FileTaskRepository implements TaskRepository {
  public constructor(
    private readonly storeRoot: string,
    private readonly dependencies: FileTaskRepositoryDependencies,
  ) {}

  /** 在 Workspace/Task Lock 内提交首条 Event 和 Snapshot。 */
  public create(task: TaskState): Promise<Result<TaskRepositoryCreateOutput, HarnessError>> {
    const paths = resolveTaskStorePaths(this.storeRoot, task.workspaceId, task.taskId);
    return createTaskInFileStore(paths, task, this.dependencies);
  }

  /** 读取 Task State 兼容投影。 */
  public async get(locator: TaskLocator): Promise<Result<TaskState, HarnessError>> {
    const loaded = await this.load(locator);
    return loaded.status === ResultStatus.Success ? success(loaded.value.aggregate.task) : loaded;
  }

  /** 在 Task Lock 内完整重放 Event 并交叉校验 Snapshot。 */
  public async load(locator: TaskLocator): Promise<Result<TaskAggregateRecord, HarnessError>> {
    const paths = resolveTaskStorePaths(this.storeRoot, locator.workspaceId, locator.taskId);
    const exists = await this.taskDirectoryExists(paths, locator);
    if (exists.status === ResultStatus.Failure) {
      return exists;
    }

    return this.withTaskLock(paths, async () => {
      const loaded = await loadTaskStore(paths, this.dependencies.snapshotStore);
      return {
        aggregate: loaded.replay.aggregate,
        lastSequence: loaded.replay.lastSequence,
        lastEventHash: loaded.replay.lastEventHash,
      };
    });
  }

  /** 在乐观 Event Tail 校验后 Append 内部语义事件。 */
  public async append(
    input: TaskEventAppendInput,
  ): Promise<Result<TaskRepositoryAppendOutput, HarnessError>> {
    const paths = resolveTaskStorePaths(
      this.storeRoot,
      input.locator.workspaceId,
      input.locator.taskId,
    );
    const exists = await this.taskDirectoryExists(paths, input.locator);
    return exists.status === ResultStatus.Failure
      ? exists
      : appendTaskRunEvent(paths, input, this.dependencies);
  }

  private async taskDirectoryExists(
    paths: TaskStorePaths,
    locator: TaskLocator,
  ): Promise<Result<true, HarnessError>> {
    try {
      return (await pathExists(paths.taskDirectory))
        ? success(true)
        : failure(createTaskNotFoundError(locator));
    } catch (error) {
      return failure(toFileEventStoreError(error, "Unable to inspect task store.", paths));
    }
  }

  private async withTaskLock<T>(
    paths: TaskStorePaths,
    operation: () => Promise<T>,
  ): Promise<Result<T, HarnessError>> {
    let lock: ExclusiveFileLockHandle;
    try {
      lock = await this.dependencies.lockManager.acquire(paths.lockFile, {
        workspaceId: paths.workspaceId,
        taskId: paths.taskId,
      });
    } catch (error) {
      return failure(toFileEventStoreError(error, "Unable to acquire task lock.", paths));
    }

    let operationResult: Result<T, HarnessError>;
    try {
      operationResult = success(await operation());
    } catch (error) {
      operationResult = failure(
        toFileEventStoreError(error, "Task store operation failed.", paths),
      );
    }
    try {
      await lock.release();
    } catch (error) {
      return failure(toFileEventStoreError(error, "Unable to release task lock.", paths));
    }
    return operationResult;
  }
}
