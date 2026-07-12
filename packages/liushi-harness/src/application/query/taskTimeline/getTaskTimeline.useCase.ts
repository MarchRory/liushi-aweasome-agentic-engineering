import { ResultStatus, type HarnessError, type Result } from "#common/index.js";
import { parseTaskId } from "#domain/task/index.js";
import { parseWorkspaceId } from "#domain/workspace/index.js";

import type { TaskEventQuery } from "../../ports/index.js";
import type { TaskTimelineProjection } from "./taskTimeline.contracts.js";
import { projectTaskTimeline } from "./taskTimeline.projector.js";

/** 通过只读 Event Query Port 返回 Tracker Task Timeline。 */
export class GetTaskTimelineUseCase {
  public constructor(private readonly eventQuery: TaskEventQuery) {}

  /** 校验 Locator、读取完整 Event 历史并构建只读 Projection。 */
  public async execute(input: {
    workspaceId: string;
    taskId: string;
  }): Promise<Result<TaskTimelineProjection, HarnessError>> {
    const workspaceId = parseWorkspaceId(input.workspaceId);
    if (workspaceId.status === ResultStatus.Failure) {
      return workspaceId;
    }

    const taskId = parseTaskId(input.taskId);
    if (taskId.status === ResultStatus.Failure) {
      return taskId;
    }

    const history = await this.eventQuery.getTaskRunEventHistory({
      workspaceId: workspaceId.value,
      taskId: taskId.value,
    });
    return history.status === ResultStatus.Failure ? history : projectTaskTimeline(history.value);
  }
}
