import {
  ResultStatus,
  failure,
  success,
  type HarnessError,
  type IdGenerator,
  type Result,
} from "#common/index.js";
import type { TaskState } from "#domain/task/index.js";

import type { TaskStorePaths } from "../contracts/index.js";
import { toFileEventStoreError } from "../errors/index.js";
import { createTaskCreatedEvent, replayTaskEvents } from "../eventLog/index.js";
import { createTaskSnapshot } from "../snapshot/index.js";
import type { PreparedTaskCreation } from "./taskCreation.contracts.js";

/** 在持有 Workspace Lock 后、创建 Task 目录前准备全部确定性数据。 */
export function prepareTaskCreation(
  task: TaskState,
  paths: TaskStorePaths,
  eventIdGenerator: IdGenerator,
): Result<PreparedTaskCreation, HarnessError> {
  try {
    const eventResult = createTaskCreatedEvent(task, eventIdGenerator);
    if (eventResult.status === ResultStatus.Failure) {
      return eventResult;
    }

    return success({
      event: eventResult.value,
      replay: replayTaskEvents([eventResult.value], task, paths.eventsFile),
      snapshot: createTaskSnapshot(eventResult.value),
    });
  } catch (error) {
    return failure(toFileEventStoreError(error, "Unable to prepare Task creation.", paths));
  }
}
