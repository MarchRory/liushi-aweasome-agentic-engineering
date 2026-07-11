import { isDeepStrictEqual } from "node:util";

import type { TaskLocator } from "#application/index.js";
import { GENESIS_EVENT_HASH, HarnessError, HarnessErrorCode } from "#common/index.js";
import { TaskPhase, TaskRunState, type TaskEventRecord } from "#domain/task/index.js";
import { createInitialTaskAggregate } from "#domain/taskRun/index.js";

import { FIRST_TASK_EVENT_SEQUENCE, SUPPORTED_TASK_EVENT_COUNT } from "../constants/index.js";
import type { TaskReplayResult } from "../contracts/index.js";
import { calculateTaskEventHash } from "./eventHash.js";

/** 校验 Task Event 不变量并从头重建 Task State。 */
export function replayTaskEvents(
  events: readonly TaskEventRecord[],
  locator: TaskLocator,
  eventsFile: string,
): TaskReplayResult {
  if (events.length !== SUPPORTED_TASK_EVENT_COUNT) {
    throw new HarnessError(
      HarnessErrorCode.CorruptStore,
      "This runtime version supports exactly one TaskCreated event per task.",
      { eventsFile, eventCount: String(events.length) },
    );
  }

  const event = events[0];
  if (event === undefined) {
    throw new HarnessError(HarnessErrorCode.CorruptStore, "Task event log is empty.", {
      eventsFile,
    });
  }
  validateTaskCreatedEvent(event, locator, eventsFile);
  return {
    task: event.payload.task,
    aggregate: createInitialTaskAggregate(event.payload.task),
    lastSequence: event.sequence,
    lastEventHash: event.hash,
  };
}

function validateTaskCreatedEvent(
  event: TaskEventRecord,
  locator: TaskLocator,
  eventsFile: string,
): void {
  const task = event.payload.task;
  const identityMatches =
    event.workspaceId === locator.workspaceId &&
    event.taskId === locator.taskId &&
    task.workspaceId === locator.workspaceId &&
    task.taskId === locator.taskId;
  const creationMatches =
    event.sequence === FIRST_TASK_EVENT_SEQUENCE &&
    event.previousHash === GENESIS_EVENT_HASH &&
    event.hash === calculateTaskEventHash(event) &&
    event.occurredAt === task.createdAt &&
    task.createdAt === task.updatedAt &&
    task.phase === TaskPhase.Context &&
    task.runState === TaskRunState.Running &&
    isDeepStrictEqual(event.actor, task.createdBy);

  if (!identityMatches || !creationMatches) {
    throw new HarnessError(
      HarnessErrorCode.CorruptStore,
      "TaskCreated event violates identity, sequence, hash, or initial-state invariants.",
      { eventsFile, sequence: String(event.sequence) },
    );
  }
}
