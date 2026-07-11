import { ResultStatus, type HarnessError, type Result } from "#common/index.js";
import { parseTaskId, type TaskState } from "#domain/task/index.js";
import { parseWorkspaceId } from "#domain/workspace/index.js";
import type { TaskRepository } from "../../ports/index.js";
import type { GetTaskStatusInput } from "./getTaskStatus.input.js";

/** 通过 Event Replay 返回 Task 当前状态。 */
export class GetTaskStatusUseCase {
  public constructor(private readonly repository: TaskRepository) {}

  /** 校验 Locator 并读取 Task State。 */
  public async execute(input: GetTaskStatusInput): Promise<Result<TaskState, HarnessError>> {
    const workspaceIdResult = parseWorkspaceId(input.workspaceId);
    if (workspaceIdResult.status === ResultStatus.Failure) {
      return workspaceIdResult;
    }

    const taskIdResult = parseTaskId(input.taskId);
    if (taskIdResult.status === ResultStatus.Failure) {
      return taskIdResult;
    }

    return this.repository.get({
      workspaceId: workspaceIdResult.value,
      taskId: taskIdResult.value,
    });
  }
}
