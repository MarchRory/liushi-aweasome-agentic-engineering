import type { HarnessError, Result } from "#common/index.js";
import type { TaskState } from "#domain/task/index.js";
import type { TaskAggregateRecord } from "#domain/taskRun/index.js";

import type {
  TaskLocator,
  TaskEventAppendInput,
  TaskRepositoryAppendOutput,
  TaskRepositoryCreateOutput,
} from "./taskRepository.contracts.js";

/** Application 持久化和重放 Task State 的 Port。 */
export interface TaskRepository {
  /** 创建 Task 并提交首条 Event 和 Snapshot。 */
  create(task: TaskState): Promise<Result<TaskRepositoryCreateOutput, HarnessError>>;
  /** 从 Snapshot 和 Event Replay 读取 Task State。 */
  get(locator: TaskLocator): Promise<Result<TaskState, HarnessError>>;
  /** 从完整 Event Replay 读取 Task Aggregate 与 Tail。 */
  load(locator: TaskLocator): Promise<Result<TaskAggregateRecord, HarnessError>>;
  /** 在乐观 Event Tail 校验后 Append 一条内部语义事件。 */
  append(input: TaskEventAppendInput): Promise<Result<TaskRepositoryAppendOutput, HarnessError>>;
}
