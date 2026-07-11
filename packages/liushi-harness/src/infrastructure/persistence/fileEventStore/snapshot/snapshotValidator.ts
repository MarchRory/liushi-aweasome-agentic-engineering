import { isDeepStrictEqual } from "node:util";

import { HarnessError, HarnessErrorCode } from "#common/index.js";
import { TaskCheckpoint, type PersistedTaskSnapshot } from "#domain/taskRun/index.js";

import type { TaskReplayResult } from "../contracts/index.js";

/** 确认 Snapshot 与其声明 Event Sequence 的权威 Replay 前缀完全一致。 */
export function validateTaskSnapshot(
  snapshot: PersistedTaskSnapshot,
  replay: TaskReplayResult,
  snapshotFile: string,
): void {
  const snapshotStateMatches =
    "aggregate" in snapshot
      ? isDeepStrictEqual(snapshot.aggregate, replay.aggregate)
      : replay.aggregate.checkpoint === TaskCheckpoint.TaskCreated &&
        replay.aggregate.artifacts.length === 0 &&
        replay.aggregate.approvals.length === 0 &&
        replay.aggregate.pendingDecision === undefined &&
        isDeepStrictEqual(snapshot.task, replay.task);
  if (
    snapshot.lastSequence !== replay.lastSequence ||
    snapshot.lastEventHash !== replay.lastEventHash ||
    !snapshotStateMatches
  ) {
    throw new HarnessError(
      HarnessErrorCode.CorruptStore,
      "Task snapshot does not match authoritative event replay.",
      { snapshotFile },
    );
  }
}
