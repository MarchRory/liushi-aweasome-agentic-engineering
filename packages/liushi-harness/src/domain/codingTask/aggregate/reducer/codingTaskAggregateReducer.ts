import {
  CODING_TASK_AGGREGATE_SCHEMA_VERSION,
  CODING_TASK_EVENT_SCHEMA_VERSION,
} from "#common/index.js";

import type { CodingTaskAggregate } from "../../contracts/index.js";
import { CodingTaskPhase, CodingTaskRunState } from "../../enums/index.js";
import { CodingTaskEventType } from "../../events/index.js";
import type { CodingTaskCreatedEvent, CodingTaskEvent } from "../../events/index.js";
import {
  assertCanonicalWriteSet,
  assertCodingTaskCreationBinding,
  assertCodingTaskExecutionAuthorization,
  assertEventTime,
  normalizeWriteSet,
} from "../../validation/index.js";
import {
  applyAttemptFinished,
  applyAttemptStarted,
  applyVerificationFinished,
  applyVerificationRequested,
} from "./codingTaskAttemptReducer.js";
import { applyImplementationSubmitted } from "./codingTaskImplementationReducer.js";
import { applyHumanControl, applyHumanResolution } from "./codingTaskHumanReducer.js";
import { corrupt } from "./codingTaskReducerErrors.js";

/** 从首个 CodingTaskCreated Event 建立初始 Aggregate。 */
export function createInitialCodingTaskAggregate(
  event: CodingTaskCreatedEvent,
): CodingTaskAggregate {
  assertCommonEvent(event);
  if (event.sequence !== 1) throw corrupt("CodingTaskCreated 必须是第一个事件。", "sequence");
  assertCodingTaskCreationBinding(event.payload.baseRevision, event.payload.worktreeBinding);
  assertCodingTaskExecutionAuthorization(event.payload.executionAuthorization);
  return {
    schemaVersion: CODING_TASK_AGGREGATE_SCHEMA_VERSION,
    codingTaskId: event.codingTaskId,
    workspaceId: event.workspaceId,
    sourceTaskId: event.payload.sourceTaskId,
    repositoryId: event.payload.repositoryId,
    baseRevision: event.payload.baseRevision,
    worktreeBinding: event.payload.worktreeBinding,
    writeSet: normalizeWriteSet(event.payload.writeSet),
    inputBindingSet: event.payload.inputBindingSet,
    executionAuthorization: event.payload.executionAuthorization,
    phase: CodingTaskPhase.Implementation,
    runState: CodingTaskRunState.Active,
    attempts: [],
    version: 1,
    createdAt: event.occurredAt,
    updatedAt: event.occurredAt,
  };
}

/** 将单个完整 Event fail-closed 地应用到 CodingTask Aggregate。 */
export function applyCodingTaskEvent(
  aggregate: CodingTaskAggregate,
  event: CodingTaskEvent,
): CodingTaskAggregate {
  assertCommonEvent(event);
  if (
    event.codingTaskId !== aggregate.codingTaskId ||
    event.workspaceId !== aggregate.workspaceId
  ) {
    throw corrupt("Event 不属于当前 CodingTask Aggregate。", "identity");
  }
  if (event.sequence !== aggregate.version + 1)
    throw corrupt("Event Sequence 不连续。", "sequence");
  switch (event.type) {
    case CodingTaskEventType.CodingTaskCreated:
      throw corrupt("已创建的 CodingTask 不能再次创建。", "type");
    case CodingTaskEventType.AttemptStarted:
      return applyAttemptStarted(aggregate, event);
    case CodingTaskEventType.AttemptFinished:
      return applyAttemptFinished(aggregate, event);
    case CodingTaskEventType.ImplementationSubmitted:
      return applyImplementationSubmitted(aggregate, event);
    case CodingTaskEventType.VerificationRequested:
      return applyVerificationRequested(aggregate, event);
    case CodingTaskEventType.VerificationFinished:
      return applyVerificationFinished(aggregate, event);
    case CodingTaskEventType.HumanControlApplied:
      return applyHumanControl(aggregate, event);
    case CodingTaskEventType.HumanResolutionApplied:
      return applyHumanResolution(aggregate, event);
    default:
      throw corrupt("CodingTask Event 类型未知。", "type");
  }
}

/** Replay 一个完整事件流并校验首事件和序列。 */
export function reduceCodingTaskEvents(events: readonly CodingTaskEvent[]): CodingTaskAggregate {
  const firstEvent = events[0];
  if (firstEvent === undefined || firstEvent.type !== CodingTaskEventType.CodingTaskCreated) {
    throw corrupt("CodingTask Event 流必须以创建事件开始。", "events");
  }
  let aggregate = createInitialCodingTaskAggregate(firstEvent);
  for (const event of events.slice(1)) aggregate = applyCodingTaskEvent(aggregate, event);
  return aggregate;
}

function assertCommonEvent(event: CodingTaskEvent): void {
  if (
    event.schemaVersion !== CODING_TASK_EVENT_SCHEMA_VERSION ||
    !Number.isInteger(event.sequence) ||
    event.sequence < 1
  ) {
    throw corrupt("Event Schema 或 Sequence 无效。", "schemaVersion");
  }
  assertEventTime(event.occurredAt);
  if (
    !event.eventId ||
    !event.codingTaskId ||
    !event.workspaceId ||
    !event.commandId ||
    !event.correlationId
  ) {
    throw corrupt("Event 公共身份字段不完整。", "event");
  }
  if (event.type === CodingTaskEventType.CodingTaskCreated)
    assertCanonicalWriteSet(event.payload.writeSet);
}
