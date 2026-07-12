import type { ActionJournalRepository } from "../../ports/index.js";
import { ResultStatus, type HarnessError, type Result } from "#common/index.js";
import type { ActionJournalState } from "#domain/actionJournal/index.js";
import { parseTaskId } from "#domain/task/index.js";
import { parseWorkspaceId } from "#domain/workspace/index.js";

/** 查询 Task 非终态 Action 的输入。 */
export interface ListRecoverableActionsInput {
  /** Action Journal 所属 Workspace ID。 */
  readonly workspaceId: string;
  /** Action Journal 所属 Task ID。 */
  readonly taskId: string;
}

/** 查询需要重试、Human 或恢复检查的 Action Journal。 */
export class ListRecoverableActionsUseCase {
  public constructor(private readonly repository: ActionJournalRepository) {}

  /** 校验 Task Locator 并返回全部非终态 Action。 */
  public async execute(
    input: ListRecoverableActionsInput,
  ): Promise<Result<readonly ActionJournalState[], HarnessError>> {
    const workspaceId = parseWorkspaceId(input.workspaceId);
    if (workspaceId.status === ResultStatus.Failure) {
      return workspaceId;
    }
    const taskId = parseTaskId(input.taskId);
    if (taskId.status === ResultStatus.Failure) {
      return taskId;
    }
    return this.repository.listRecoverable({
      workspaceId: workspaceId.value,
      taskId: taskId.value,
    });
  }
}
