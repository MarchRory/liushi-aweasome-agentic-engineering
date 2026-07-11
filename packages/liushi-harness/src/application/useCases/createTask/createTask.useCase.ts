import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  validateActorRef,
  type Clock,
  type IdGenerator,
  type Result,
} from "#common/index.js";
import {
  MAX_TASK_SOURCE_LENGTH,
  createInitialTaskState,
  parseTaskId,
  type TaskState,
} from "#domain/task/index.js";
import { parseWorkspaceId } from "#domain/workspace/index.js";
import type { TaskPersistenceOutcome, TaskRepository } from "../../ports/index.js";
import type { CreateTaskInput } from "./createTask.input.js";

/** CreateTask 成功输出。 */
export interface CreateTaskOutput {
  /** 已提交并从 authoritative Event Replay 得到的 Task。 */
  task: TaskState;
  /** Event commit boundary 之后的持久化健康信息。 */
  persistence: TaskPersistenceOutcome;
}

/** 创建并持久化 Task 初始状态。 */
export class CreateTaskUseCase {
  public constructor(
    private readonly repository: TaskRepository,
    private readonly clock: Clock,
    private readonly taskIdGenerator: IdGenerator,
  ) {}

  /** 校验输入并提交 TaskCreated Event。 */
  public async execute(input: CreateTaskInput): Promise<Result<CreateTaskOutput, HarnessError>> {
    const workspaceIdResult = parseWorkspaceId(input.workspaceId);
    if (workspaceIdResult.status === ResultStatus.Failure) {
      return workspaceIdResult;
    }

    const sourceResult = normalizeSource(input.source);
    if (sourceResult.status === ResultStatus.Failure) {
      return sourceResult;
    }

    const actorResult = validateActorRef(input.actor);
    if (actorResult.status === ResultStatus.Failure) {
      return actorResult;
    }

    const taskIdResult = parseTaskId(this.taskIdGenerator.next());
    if (taskIdResult.status === ResultStatus.Failure) {
      return taskIdResult;
    }

    const occurredAt = this.clock.now().toISOString();
    const task = createInitialTaskState({
      taskId: taskIdResult.value,
      workspaceId: workspaceIdResult.value,
      ...(sourceResult.value === undefined ? {} : { source: sourceResult.value }),
      actor: actorResult.value,
      occurredAt,
    });

    return this.repository.create(task);
  }
}

function normalizeSource(source: string | undefined): Result<string | undefined, HarnessError> {
  if (source === undefined) {
    return success(undefined);
  }

  const normalized = source.trim();
  if (normalized.length === 0 || normalized.length > MAX_TASK_SOURCE_LENGTH) {
    return failure(
      new HarnessError(
        HarnessErrorCode.InvalidInput,
        `Task source must contain 1-${MAX_TASK_SOURCE_LENGTH} characters when provided.`,
        { field: "source" },
      ),
    );
  }

  return success(normalized);
}
