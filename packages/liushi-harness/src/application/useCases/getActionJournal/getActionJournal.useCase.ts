import type { ActionJournalRepository } from "../../ports/index.js";
import { ResultStatus, type HarnessError, type Result } from "#common/index.js";
import { parseActionId, type ActionJournalState } from "#domain/actionJournal/index.js";
import { parseTaskId } from "#domain/task/index.js";
import { parseWorkspaceId } from "#domain/workspace/index.js";

/** 查询单个 Action Journal 的输入。 */
export interface GetActionJournalInput {
  /** Action 所属 Workspace ID。 */
  readonly workspaceId: string;
  /** Action 所属 Task ID。 */
  readonly taskId: string;
  /** Action 的稳定 ULID。 */
  readonly actionId: string;
}

/** 通过只读 Port 重放一个 Action Journal。 */
export class GetActionJournalUseCase {
  public constructor(private readonly repository: ActionJournalRepository) {}

  /** 校验 Locator 并返回权威 Journal State。 */
  public async execute(
    input: GetActionJournalInput,
  ): Promise<Result<ActionJournalState, HarnessError>> {
    const workspaceId = parseWorkspaceId(input.workspaceId);
    if (workspaceId.status === ResultStatus.Failure) {
      return workspaceId;
    }
    const taskId = parseTaskId(input.taskId);
    if (taskId.status === ResultStatus.Failure) {
      return taskId;
    }
    const actionId = parseActionId(input.actionId);
    if (actionId.status === ResultStatus.Failure) {
      return actionId;
    }
    return this.repository.load({
      workspaceId: workspaceId.value,
      taskId: taskId.value,
      actionId: actionId.value,
    });
  }
}
