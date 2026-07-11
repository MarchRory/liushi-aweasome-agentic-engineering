import type { TaskEventAppendInput, TaskRepositoryAppendOutput } from "#application/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  type Result,
} from "#common/index.js";
import {
  TaskRunEventType,
  type TaskAggregateRecord,
  type TaskRunEventRecord,
} from "#domain/taskRun/index.js";

import { failBeforeEventCommit } from "../commitRecovery/index.js";
import type { TaskStorePaths } from "../contracts/index.js";
import { toFileEventStoreError } from "../errors/index.js";
import {
  appendEventLog,
  createApprovalRecordedEvent,
  createArtifactCommittedEvent,
  replayTaskRunEvents,
} from "../eventLog/index.js";
import type { ExclusiveFileLockHandle } from "../lock/index.js";
import { loadTaskStore } from "../taskLoading/index.js";
import type { TaskPersistenceDependencies } from "../taskCreation/index.js";
import { finalizeAppendedTaskEvent } from "./taskAppendFinalizer.js";

/** 在 Task Lock 与乐观 Tail 校验下 Append 一条内部语义事件。 */
export async function appendTaskRunEvent(
  paths: TaskStorePaths,
  input: TaskEventAppendInput,
  dependencies: TaskPersistenceDependencies,
): Promise<Result<TaskRepositoryAppendOutput, HarnessError>> {
  let taskLock: ExclusiveFileLockHandle;
  try {
    taskLock = await dependencies.lockManager.acquire(paths.lockFile, {
      workspaceId: paths.workspaceId,
      taskId: paths.taskId,
    });
  } catch (error) {
    return failure(toFileEventStoreError(error, "Unable to acquire task lock.", paths));
  }

  try {
    const loaded = await loadTaskStore(paths, dependencies.snapshotStore);
    assertExpectedTail(input, loaded.replay.lastSequence, loaded.replay.lastEventHash);
    const eventResult = createEvent(
      input,
      loaded.replay.lastSequence,
      loaded.replay.lastEventHash,
      dependencies,
    );
    if (eventResult.status === ResultStatus.Failure) {
      return failBeforeEventCommit(eventResult.error, "Unable to create Task run event.", paths, {
        task: taskLock,
      });
    }

    const events = [...loaded.events, eventResult.value];
    const replay = replayTaskRunEvents(events, input.locator, paths.eventsFile);
    const record: TaskAggregateRecord = {
      aggregate: replay.aggregate,
      lastSequence: replay.lastSequence,
      lastEventHash: replay.lastEventHash,
    };
    const eventCommit = await appendEventLog(paths.eventsFile, eventResult.value);
    return finalizeAppendedTaskEvent(paths, record, eventCommit, taskLock, dependencies);
  } catch (error) {
    return failBeforeEventCommit(
      error,
      "Task run event failed before authoritative append commit.",
      paths,
      { task: taskLock },
    );
  }
}

function createEvent(
  input: TaskEventAppendInput,
  lastSequence: number,
  lastEventHash: string,
  dependencies: TaskPersistenceDependencies,
): Result<TaskRunEventRecord, HarnessError> {
  const common = {
    workspaceId: input.locator.workspaceId,
    taskId: input.locator.taskId,
    sequence: lastSequence + 1,
    previousHash: lastEventHash,
    occurredAt: input.occurredAt,
    actor: input.actor,
    eventIdGenerator: dependencies.eventIdGenerator,
  };
  switch (input.type) {
    case TaskRunEventType.ArtifactCommitted:
      return createArtifactCommittedEvent({ ...common, payload: input.payload });
    case TaskRunEventType.ApprovalRecorded:
      return createApprovalRecordedEvent({ ...common, payload: input.payload });
  }
}

function assertExpectedTail(
  input: TaskEventAppendInput,
  lastSequence: number,
  lastEventHash: string,
): void {
  if (
    input.expectedLastSequence !== lastSequence ||
    input.expectedLastEventHash !== lastEventHash
  ) {
    throw new HarnessError(
      HarnessErrorCode.VersionConflict,
      "Task Event Tail changed after the caller loaded it.",
      {
        expectedSequence: String(input.expectedLastSequence),
        actualSequence: String(lastSequence),
        expectedHash: input.expectedLastEventHash,
        actualHash: lastEventHash,
      },
    );
  }
}
