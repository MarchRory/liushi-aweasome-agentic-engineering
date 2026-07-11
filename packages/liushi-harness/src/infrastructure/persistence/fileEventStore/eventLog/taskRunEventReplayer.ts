import type { TaskLocator } from "#application/index.js";
import { ActorKind, HarnessError, HarnessErrorCode } from "#common/index.js";
import { TaskEventType } from "#domain/task/index.js";
import {
  TaskRunEventType,
  applyApprovalRecorded,
  applyArtifactCommitted,
  type TaskRunEventRecord,
} from "#domain/taskRun/index.js";

import type { TaskReplayResult } from "../contracts/index.js";
import {
  assertApprovalRecordedContentDigest,
  assertArtifactCommittedContentDigests,
} from "./contentDigest/index.js";
import { calculateTaskRunEventHash } from "./eventHash.js";
import { replayTaskEvents } from "./taskEventReplayer.js";

/** 校验完整 Event Chain，并从头重建 Task Aggregate。 */
export function replayTaskRunEvents(
  events: readonly TaskRunEventRecord[],
  locator: TaskLocator,
  eventsFile: string,
): TaskReplayResult {
  const first = events[0];
  if (first === undefined || first.type !== TaskEventType.TaskCreated) {
    throw corruptEvent("Task event log must start with TaskCreated.", eventsFile, 1);
  }

  const initial = replayTaskEvents([first], locator, eventsFile);
  let aggregate = initial.aggregate;
  let previous: TaskRunEventRecord = first;

  for (const event of events.slice(1)) {
    validateEventChainLink(event, previous, locator, eventsFile);
    try {
      switch (event.type) {
        case TaskRunEventType.ArtifactCommitted:
          validateArtifactEventMetadata(event);
          aggregate = applyArtifactCommitted(aggregate, event);
          break;
        case TaskRunEventType.ApprovalRecorded:
          validateApprovalEventMetadata(event);
          aggregate = applyApprovalRecorded(aggregate, event);
          break;
        case TaskEventType.TaskCreated:
          throw new Error("TaskCreated may only appear as the first event.");
      }
    } catch (error) {
      throw new HarnessError(
        HarnessErrorCode.CorruptStore,
        "Task run event violates a domain invariant.",
        { eventsFile, sequence: String(event.sequence), type: event.type },
        error,
      );
    }
    previous = event;
  }

  return {
    task: aggregate.task,
    aggregate,
    lastSequence: previous.sequence,
    lastEventHash: previous.hash,
  };
}

function validateEventChainLink(
  event: TaskRunEventRecord,
  previous: TaskRunEventRecord,
  locator: TaskLocator,
  eventsFile: string,
): void {
  const { hash, ...hashInput } = event;
  const valid =
    event.workspaceId === locator.workspaceId &&
    event.taskId === locator.taskId &&
    event.sequence === previous.sequence + 1 &&
    event.previousHash === previous.hash &&
    hash === calculateTaskRunEventHash(hashInput) &&
    Date.parse(event.occurredAt) >= Date.parse(previous.occurredAt);
  if (!valid) {
    throw corruptEvent(
      "Task run event violates identity, sequence, hash, or chronological invariants.",
      eventsFile,
      event.sequence,
    );
  }
}

function validateArtifactEventMetadata(
  event: Extract<TaskRunEventRecord, { type: TaskRunEventType.ArtifactCommitted }>,
): void {
  const { artifact, gateEvaluation, decisionRequest } = event.payload;
  assertArtifactCommittedContentDigests(event.payload);
  const actorMatches =
    event.actor.kind === artifact.createdBy.kind &&
    event.actor.actorId === artifact.createdBy.actorId;
  const decisionMatches =
    decisionRequest === undefined ||
    (decisionRequest.createdAt === event.occurredAt &&
      decisionRequest.createdBy.kind === event.actor.kind &&
      decisionRequest.createdBy.actorId === event.actor.actorId);
  if (
    !actorMatches ||
    !decisionMatches ||
    artifact.createdAt !== event.occurredAt ||
    gateEvaluation.evaluatedAt !== event.occurredAt
  ) {
    throw new Error("ArtifactCommitted metadata does not match the Event envelope.");
  }
}

function validateApprovalEventMetadata(
  event: Extract<TaskRunEventRecord, { type: TaskRunEventType.ApprovalRecorded }>,
): void {
  const { approval, gateEvaluation } = event.payload;
  assertApprovalRecordedContentDigest(event.payload);
  if (
    event.actor.kind !== ActorKind.Human ||
    event.actor.kind !== approval.actor.kind ||
    event.actor.actorId !== approval.actor.actorId ||
    approval.createdAt !== event.occurredAt ||
    gateEvaluation.evaluatedAt !== event.occurredAt
  ) {
    throw new Error("ApprovalRecorded metadata does not match the Event envelope.");
  }
}

function corruptEvent(message: string, eventsFile: string, sequence: number): HarnessError {
  return new HarnessError(HarnessErrorCode.CorruptStore, message, {
    eventsFile,
    sequence: String(sequence),
  });
}
