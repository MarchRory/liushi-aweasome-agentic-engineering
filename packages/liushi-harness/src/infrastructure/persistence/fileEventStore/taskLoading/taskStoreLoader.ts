import { HarnessError, HarnessErrorCode } from "#common/index.js";

import type { TaskStorePaths } from "../contracts/index.js";
import {
  TASK_EVENTS_FILE_NAME,
  TASK_LOCK_FILE_NAME,
  TASK_SNAPSHOT_FILE_NAME,
} from "../constants/index.js";
import { createTaskNotFoundError } from "../errors/index.js";
import { readTaskEvents, replayTaskRunEvents } from "../eventLog/index.js";
import { validateTaskSnapshot, type SnapshotStore } from "../snapshot/index.js";
import { listTaskStoreEntries, pathExists } from "../taskStore/index.js";
import type { LoadedTaskStore } from "./taskLoading.contracts.js";

/** 在调用方持有 Task Lock 时加载、重放并校验完整 Task Store。 */
export async function loadTaskStore(
  paths: TaskStorePaths,
  snapshotStore: SnapshotStore,
): Promise<LoadedTaskStore> {
  const unexpectedEntries = (await listTaskStoreEntries(paths.taskDirectory))
    .filter(
      (entry) =>
        entry !== TASK_EVENTS_FILE_NAME &&
        entry !== TASK_SNAPSHOT_FILE_NAME &&
        entry !== TASK_LOCK_FILE_NAME,
    )
    .sort();
  if (unexpectedEntries.length > 0) {
    throw new HarnessError(
      HarnessErrorCode.CorruptStore,
      "Task directory contains state unsupported by this runtime version.",
      { taskDirectory: paths.taskDirectory, entries: unexpectedEntries.join(",") },
    );
  }

  const eventsExist = await pathExists(paths.eventsFile);
  const snapshotExists = await pathExists(paths.snapshotFile);
  if (!eventsExist && !snapshotExists) {
    throw createTaskNotFoundError(paths);
  }
  if (!eventsExist) {
    throw new HarnessError(
      HarnessErrorCode.CorruptStore,
      "Task snapshot exists without its authoritative event log.",
      { taskDirectory: paths.taskDirectory },
    );
  }

  const events = await readTaskEvents(paths.eventsFile);
  const replay = replayTaskRunEvents(events, paths, paths.eventsFile);
  if (snapshotExists) {
    const snapshot = await snapshotStore.read(paths.snapshotFile);
    const snapshotReplay = replayTaskRunEvents(
      events.slice(0, snapshot.lastSequence),
      paths,
      paths.eventsFile,
    );
    validateTaskSnapshot(snapshot, snapshotReplay, paths.snapshotFile);
  }
  return { events, replay };
}
