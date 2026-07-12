import { GENESIS_EVENT_HASH, HarnessError, HarnessErrorCode } from "#common/index.js";
import type { CodingTaskLocator } from "#application/ports/index.js";
import {
  reduceCodingTaskEvents,
  type CodingTaskAggregateRecord,
  type CodingTaskEvent,
  CodingTaskEventType,
} from "#domain/codingTask/index.js";
import { validateCodingTaskHashChain } from "../eventLog/index.js";

/** 校验 Hash Chain 并完整 Replay CodingTask Aggregate。 */
export function replayCodingTaskEvents(
  events: readonly CodingTaskEvent[],
  locator: CodingTaskLocator,
): CodingTaskAggregateRecord {
  return replay(events, locator, false);
}

/** 校验追加事件的候选状态，保留领域状态错误供 Command Gateway 返回。 */
export function validateCodingTaskEventCandidate(
  events: readonly CodingTaskEvent[],
  locator: CodingTaskLocator,
): CodingTaskAggregateRecord {
  return replay(events, locator, true);
}

function replay(
  events: readonly CodingTaskEvent[],
  locator: CodingTaskLocator,
  preserveDomainErrors: boolean,
): CodingTaskAggregateRecord {
  const first = events[0];
  if (
    first === undefined ||
    first.previousHash !== GENESIS_EVENT_HASH ||
    first.type !== CodingTaskEventType.CodingTaskCreated
  )
    throw corrupt("CodingTask Event Log 必须以有效的 CodingTaskCreated 开始。");
  try {
    assertEventLocator(events, locator);
    validateCodingTaskHashChain(events);
    const aggregate = reduceCodingTaskEvents(events);
    const last = events[events.length - 1];
    if (last === undefined) throw corrupt("CodingTask Event Log 缺少尾部事件。");
    return { aggregate, lastSequence: aggregate.version, lastEventHash: last.hash };
  } catch (error) {
    if (
      error instanceof HarnessError &&
      (error.code === HarnessErrorCode.CorruptStore || preserveDomainErrors)
    )
      throw error;
    throw corrupt("CodingTask Event Replay 未通过 Aggregate invariant。", error);
  }
}

function assertEventLocator(events: readonly CodingTaskEvent[], locator: CodingTaskLocator): void {
  for (const event of events) {
    if (event.workspaceId !== locator.workspaceId || event.codingTaskId !== locator.codingTaskId) {
      throw corrupt("CodingTask Event 与目录 Locator 不一致。", {
        workspaceId: locator.workspaceId,
        codingTaskId: locator.codingTaskId,
      });
    }
  }
}
function corrupt(message: string, cause?: unknown): HarnessError {
  return new HarnessError(HarnessErrorCode.CorruptStore, message, {}, cause);
}
