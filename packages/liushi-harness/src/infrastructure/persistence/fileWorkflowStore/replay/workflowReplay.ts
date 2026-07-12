import { GENESIS_EVENT_HASH, HarnessError, HarnessErrorCode } from "#common/index.js";
import {
  applyWorkflowEvent,
  createInitialWorkflowAggregate,
  type WorkflowAggregateRecord,
  type WorkflowEvent,
  WorkflowEventType,
} from "#domain/workflow/index.js";

import { validateWorkflowHashChain } from "../eventLog/index.js";

/** 从完整 Event Stream 确定性重建 Workflow Aggregate。 */
export function replayWorkflowEvents(events: readonly WorkflowEvent[]): WorkflowAggregateRecord {
  const first = events[0];
  if (first === undefined || first.previousHash !== GENESIS_EVENT_HASH) {
    throw corrupt("Workflow Event Log 缺少有效的 Genesis Event。", {});
  }
  validateWorkflowHashChain(events);
  if (first.type !== WorkflowEventType.WorkflowCreated) {
    throw corrupt("Workflow Event Log 必须以 WorkflowCreated 开始。", {});
  }

  try {
    let aggregate = createInitialWorkflowAggregate(first);
    for (const event of events.slice(1)) {
      aggregate = applyWorkflowEvent(aggregate, event);
    }
    const lastEvent = events[events.length - 1];
    if (lastEvent === undefined) {
      throw corrupt("Workflow Event Log 缺少尾部 Event。", {});
    }
    return {
      aggregate,
      lastSequence: aggregate.version,
      lastEventHash: lastEvent.hash,
    };
  } catch (error) {
    if (error instanceof HarnessError && error.code === HarnessErrorCode.CorruptStore) {
      throw error;
    }
    throw corrupt("Workflow Event Replay 未通过 Aggregate Invariant。", {}, error);
  }
}

function corrupt(
  message: string,
  details: Readonly<Record<string, string>>,
  cause?: unknown,
): HarnessError {
  return new HarnessError(HarnessErrorCode.CorruptStore, message, details, cause);
}
