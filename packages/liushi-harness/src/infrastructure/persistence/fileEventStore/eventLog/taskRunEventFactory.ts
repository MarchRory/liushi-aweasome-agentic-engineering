import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  TASK_EVENT_SCHEMA_VERSION,
  failure,
  success,
  type Result,
} from "#common/index.js";
import { parseEventId } from "#domain/task/index.js";
import {
  TaskRunEventType,
  type ApprovalRecordedEventRecord,
  type ArtifactCommittedEventRecord,
} from "#domain/taskRun/index.js";

import { calculateTaskRunEventHash } from "./eventHash.js";
import type {
  ApprovalRecordedEventFactoryInput,
  ArtifactCommittedEventFactoryInput,
  TaskRunEventFactoryInput,
} from "./taskRunEventFactory.contracts.js";

/** 创建并 Hash 一条 ArtifactCommitted Event。 */
export function createArtifactCommittedEvent(
  input: ArtifactCommittedEventFactoryInput,
): Result<ArtifactCommittedEventRecord, HarnessError> {
  const eventIdResult = nextEventId(input);
  if (eventIdResult.status === ResultStatus.Failure) {
    return eventIdResult;
  }
  const eventWithoutHash = {
    schemaVersion: TASK_EVENT_SCHEMA_VERSION,
    eventId: eventIdResult.value,
    taskId: input.taskId,
    workspaceId: input.workspaceId,
    sequence: input.sequence,
    type: TaskRunEventType.ArtifactCommitted,
    occurredAt: input.occurredAt,
    actor: input.actor,
    payload: input.payload,
    previousHash: input.previousHash,
  } satisfies Omit<ArtifactCommittedEventRecord, "hash">;
  return success({ ...eventWithoutHash, hash: calculateTaskRunEventHash(eventWithoutHash) });
}

/** 创建并 Hash 一条 ApprovalRecorded Event。 */
export function createApprovalRecordedEvent(
  input: ApprovalRecordedEventFactoryInput,
): Result<ApprovalRecordedEventRecord, HarnessError> {
  const eventIdResult = nextEventId(input);
  if (eventIdResult.status === ResultStatus.Failure) {
    return eventIdResult;
  }
  const eventWithoutHash = {
    schemaVersion: TASK_EVENT_SCHEMA_VERSION,
    eventId: eventIdResult.value,
    taskId: input.taskId,
    workspaceId: input.workspaceId,
    sequence: input.sequence,
    type: TaskRunEventType.ApprovalRecorded,
    occurredAt: input.occurredAt,
    actor: input.actor,
    payload: input.payload,
    previousHash: input.previousHash,
  } satisfies Omit<ApprovalRecordedEventRecord, "hash">;
  return success({ ...eventWithoutHash, hash: calculateTaskRunEventHash(eventWithoutHash) });
}

function nextEventId(input: TaskRunEventFactoryInput) {
  try {
    return parseEventId(input.eventIdGenerator.next());
  } catch (error) {
    return failure(
      new HarnessError(
        HarnessErrorCode.IoFailure,
        "Event ID generator failed.",
        { operation: "eventIdGenerator.next" },
        error,
      ),
    );
  }
}
