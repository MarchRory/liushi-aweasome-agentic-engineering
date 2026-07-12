import type { HarnessError, Result } from "#common/index.js";
import type { TaskRunEventRecord } from "#domain/taskRun/index.js";

import type { TaskLocator } from "../taskRepository/index.js";

/** 为查询 Projection 提供完整 Event 历史的独立只读 Port。 */
export interface TaskEventQuery {
  /** 根据 Workspace/Task Locator 读取完整 TaskRunEventRecord 历史。 */
  getTaskRunEventHistory(
    locator: TaskLocator,
  ): Promise<Result<readonly TaskRunEventRecord[], HarnessError>>;
}
