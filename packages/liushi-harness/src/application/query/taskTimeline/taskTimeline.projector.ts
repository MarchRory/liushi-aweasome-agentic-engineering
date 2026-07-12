import { HarnessError, HarnessErrorCode, failure, success, type Result } from "#common/index.js";
import { TaskEventType } from "#domain/task/index.js";
import { TaskRunEventType, type TaskRunEventRecord } from "#domain/taskRun/index.js";

import { TASK_TIMELINE_PROJECTION_SCHEMA_VERSION } from "./taskTimeline.constants.js";
import type {
  ApprovalRecordedTimelineEntry,
  ArtifactCommittedTimelineEntry,
  TaskCreatedTimelineEntry,
  TaskTimelineEntry,
  TaskTimelineProjection,
} from "./taskTimeline.contracts.js";
import { TaskTimelineEntryKind } from "./taskTimeline.enums.js";

/** 从完整 Event 历史纯函数式重建 Tracker Task Timeline。 */
export function projectTaskTimeline(
  events: readonly TaskRunEventRecord[],
): Result<TaskTimelineProjection, HarnessError> {
  const orderedEvents = [...events].sort(compareEvents);
  const historyError = validateHistory(orderedEvents);
  if (historyError !== undefined) {
    return failure(historyError);
  }

  const firstEvent = orderedEvents[0]!;
  const lastEvent = orderedEvents[orderedEvents.length - 1]!;
  return success({
    schemaVersion: TASK_TIMELINE_PROJECTION_SCHEMA_VERSION,
    workspaceId: firstEvent.workspaceId,
    taskId: firstEvent.taskId,
    lastSequence: lastEvent.sequence,
    lastEventHash: lastEvent.hash,
    entries: orderedEvents.map(projectEvent),
  });
}

function compareEvents(left: TaskRunEventRecord, right: TaskRunEventRecord): number {
  return left.sequence - right.sequence || left.eventId.localeCompare(right.eventId);
}

function validateHistory(events: readonly TaskRunEventRecord[]): HarnessError | undefined {
  const firstEvent = events[0];
  if (
    firstEvent === undefined ||
    firstEvent.sequence !== 1 ||
    firstEvent.type !== TaskEventType.TaskCreated
  ) {
    return corruptHistory("Task Timeline requires TaskCreated at sequence 1.");
  }

  for (const [index, event] of events.entries()) {
    const previous = events[index - 1];
    if (
      event.sequence !== index + 1 ||
      event.workspaceId !== firstEvent.workspaceId ||
      event.taskId !== firstEvent.taskId ||
      (previous !== undefined && event.previousHash !== previous.hash)
    ) {
      return corruptHistory("Task Timeline Event history is not a contiguous authoritative chain.");
    }
  }
  return undefined;
}

function corruptHistory(message: string): HarnessError {
  return new HarnessError(HarnessErrorCode.CorruptStore, message);
}

function projectEvent(event: TaskRunEventRecord): TaskTimelineEntry {
  switch (event.type) {
    case TaskEventType.TaskCreated:
      return projectTaskCreated(event);
    case TaskRunEventType.ArtifactCommitted:
      return projectArtifactCommitted(event);
    case TaskRunEventType.ApprovalRecorded:
      return projectApprovalRecorded(event);
  }
}

function projectTaskCreated(
  event: Extract<TaskRunEventRecord, { type: TaskEventType.TaskCreated }>,
): TaskCreatedTimelineEntry {
  return {
    eventId: event.eventId,
    sequence: event.sequence,
    kind: TaskTimelineEntryKind.TaskCreated,
    occurredAt: event.occurredAt,
    actor: { ...event.actor },
    ...(event.payload.task.source === undefined ? {} : { source: event.payload.task.source }),
  };
}

function projectArtifactCommitted(
  event: Extract<TaskRunEventRecord, { type: TaskRunEventType.ArtifactCommitted }>,
): ArtifactCommittedTimelineEntry {
  const { artifact, gateEvaluation, decisionRequest } = event.payload;
  const gate = decisionRequest?.gate ?? gateEvaluation.requiredGates[0];
  return {
    eventId: event.eventId,
    sequence: event.sequence,
    kind: TaskTimelineEntryKind.ArtifactCommitted,
    occurredAt: event.occurredAt,
    actor: { ...event.actor },
    artifactId: artifact.artifactId,
    artifactType: artifact.artifactType,
    revision: artifact.revision,
    digest: artifact.digest,
    ...(gate === undefined ? {} : { gate }),
    gateResult: gateEvaluation.result,
    ...(decisionRequest === undefined
      ? {}
      : { decisionRequestId: decisionRequest.decisionRequestId }),
  };
}

function projectApprovalRecorded(
  event: Extract<TaskRunEventRecord, { type: TaskRunEventType.ApprovalRecorded }>,
): ApprovalRecordedTimelineEntry {
  const { approval } = event.payload;
  return {
    eventId: event.eventId,
    sequence: event.sequence,
    kind: TaskTimelineEntryKind.ApprovalRecorded,
    occurredAt: event.occurredAt,
    actor: { ...event.actor },
    approvalId: approval.approvalId,
    decision: approval.decision,
    gate: approval.gate,
    artifactId: approval.artifactId,
    artifactDigest: approval.artifactDigest,
  };
}
