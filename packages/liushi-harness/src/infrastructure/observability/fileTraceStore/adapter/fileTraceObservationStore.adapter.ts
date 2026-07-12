import {
  TraceDropReason,
  TraceWriteDisposition,
  type TraceObservationStore,
  type TraceQuery,
  type TraceQueryResult,
  type TraceSpanObservation,
  type TraceWriteOutcome,
} from "#application/index.js";
import { HarnessError, HarnessErrorCode, failure, success, type Result } from "#common/index.js";
import { type ExclusiveFileLockHandle } from "#infrastructure/persistence/fileEventStore/index.js";
import {
  pathExists,
  resolveTaskStorePaths,
} from "#infrastructure/persistence/fileEventStore/taskStore/index.js";

import type { FileTraceStoreDependencies } from "../contracts/index.js";
import { appendTraceObservation, readTraceObservations } from "../io/index.js";

/** 使用 Task 级 traces.jsonl 实现可丢失 Trace Observation Store。 */
export class FileTraceObservationStore implements TraceObservationStore {
  public constructor(
    private readonly storeRoot: string,
    private readonly dependencies: FileTraceStoreDependencies,
  ) {}

  /** 单次尝试写入；任何基础设施故障都收敛为 Dropped。 */
  public async record(observation: TraceSpanObservation): Promise<TraceWriteOutcome> {
    const paths = resolveTaskStorePaths(
      this.storeRoot,
      observation.workspaceId,
      observation.taskId,
    );
    try {
      if (!(await pathExists(paths.eventsFile))) {
        return dropped(TraceDropReason.TaskUnavailable);
      }
    } catch {
      return dropped(TraceDropReason.IoFailure);
    }

    let lock: ExclusiveFileLockHandle;
    try {
      lock = await this.dependencies.lockManager.acquire(paths.tracesLockFile, {
        workspaceId: paths.workspaceId,
        taskId: paths.taskId,
      });
    } catch (error) {
      return dropped(
        error instanceof HarnessError && error.code === HarnessErrorCode.LockUnavailable
          ? TraceDropReason.Contended
          : TraceDropReason.IoFailure,
      );
    }

    try {
      await appendTraceObservation(paths.tracesFile, observation);
    } catch {
      return dropped(
        TraceDropReason.IoFailure,
        await releaseForRecovery(lock, paths.tracesLockFile),
      );
    }
    const recoveryPaths = await releaseForRecovery(lock, paths.tracesLockFile);
    return {
      disposition: TraceWriteDisposition.Persisted,
      recoveryPaths,
    };
  }

  /** 读取有效 Observation；单条损坏 Trace 不污染语义 Store。 */
  public async query(query: TraceQuery): Promise<Result<TraceQueryResult, HarnessError>> {
    const paths = resolveTaskStorePaths(this.storeRoot, query.workspaceId, query.taskId);
    if (!(await pathExists(paths.eventsFile))) {
      return failure(
        new HarnessError(HarnessErrorCode.TaskNotFound, "Trace 对应的 Task 不存在。", {
          workspaceId: paths.workspaceId,
          taskId: paths.taskId,
        }),
      );
    }
    try {
      const read = await readTraceObservations(paths.tracesFile);
      return success({
        observations: read.observations
          .filter((observation) => matches(query, observation))
          .sort(
            (left, right) =>
              left.startedAt.localeCompare(right.startedAt) ||
              left.spanId.localeCompare(right.spanId),
          ),
        skippedRecordCount: read.skippedRecordCount,
      });
    } catch (error) {
      return failure(
        new HarnessError(
          HarnessErrorCode.IoFailure,
          "Trace Observation 读取失败。",
          { traceFile: paths.tracesFile },
          error,
        ),
      );
    }
  }
}

function matches(query: TraceQuery, observation: TraceSpanObservation): boolean {
  return (
    (query.traceId === undefined || observation.traceId === query.traceId) &&
    (query.correlationId === undefined || observation.correlationId === query.correlationId) &&
    (query.actionId === undefined || observation.actionId === query.actionId)
  );
}

async function releaseForRecovery(
  lock: ExclusiveFileLockHandle,
  lockFile: string,
): Promise<readonly string[]> {
  try {
    await lock.release();
    return [];
  } catch {
    return [lockFile];
  }
}

function dropped(
  reason: TraceDropReason,
  recoveryPaths: readonly string[] = [],
): TraceWriteOutcome {
  return { disposition: TraceWriteDisposition.Dropped, reason, recoveryPaths };
}
