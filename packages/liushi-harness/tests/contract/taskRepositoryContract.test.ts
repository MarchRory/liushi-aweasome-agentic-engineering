import { afterEach, describe, expect, it } from "vitest";

import {
  ActorKind,
  HarnessErrorCode,
  ResultStatus,
  createInitialTaskState,
  parseTaskId,
  parseWorkspaceId,
  type TaskRepository,
} from "../../src/index.js";
import {
  ExclusiveFileLockManager,
  FileParentDirectoryDurability,
  FileSnapshotStore,
  FileTaskRepository,
} from "../../src/infrastructure/index.js";
import { FixedSequenceIdGenerator, TemporaryRuntimeStore } from "../support/runtime/index.js";

const TASK_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const EVENT_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAW";
const WORKSPACE_ID = "workspace-a";
const OCCURRED_AT = "2026-07-11T00:00:00.000Z";
const runtimeStores = new TemporaryRuntimeStore();

const taskIdResult = parseTaskId(TASK_ID);
if (taskIdResult.status === ResultStatus.Failure) {
  throw taskIdResult.error;
}
const workspaceIdResult = parseWorkspaceId(WORKSPACE_ID);
if (workspaceIdResult.status === ResultStatus.Failure) {
  throw workspaceIdResult.error;
}

const locator = {
  taskId: taskIdResult.value,
  workspaceId: workspaceIdResult.value,
};
const task = createInitialTaskState({
  ...locator,
  source: "ticket-123",
  actor: { kind: ActorKind.Human, actorId: "tester" },
  occurredAt: OCCURRED_AT,
});

afterEach(async () => runtimeStores.cleanup());

describe("FileTaskRepository 的 TaskRepository Port contract", () => {
  it("get 不存在的 Task 返回 TaskNotFound", async () => {
    const repository = await createRepository();

    const result = await repository.get(locator);

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Failure) {
      expect(result.error.code).toBe(HarnessErrorCode.TaskNotFound);
    }
  });

  it("create 后 get 返回相同 Task State", async () => {
    const repository = await createRepository();

    const created = await repository.create(task);
    const loaded = await repository.get(locator);

    expect(created.status).toBe(ResultStatus.Success);
    if (created.status === ResultStatus.Success) {
      expect(created.value.task).toEqual(task);
    }
    expect(loaded).toEqual({ status: ResultStatus.Success, value: task });
  });

  it("重复 create 返回 TaskAlreadyExists 且原 Task 仍可读取", async () => {
    const repository = await createRepository();
    const first = await repository.create(task);

    const duplicate = await repository.create(task);
    const loaded = await repository.get(locator);

    expect(first.status).toBe(ResultStatus.Success);
    expect(duplicate.status).toBe(ResultStatus.Failure);
    if (duplicate.status === ResultStatus.Failure) {
      expect(duplicate.error.code).toBe(HarnessErrorCode.TaskAlreadyExists);
    }
    expect(loaded).toEqual({ status: ResultStatus.Success, value: task });
  });
});

async function createRepository(): Promise<TaskRepository> {
  const storeRoot = await runtimeStores.create("liushi-task-repository-contract-");
  return new FileTaskRepository(storeRoot, {
    eventIdGenerator: new FixedSequenceIdGenerator([EVENT_ID]),
    snapshotStore: new FileSnapshotStore(),
    lockManager: new ExclusiveFileLockManager(),
    parentDirectoryDurability: new FileParentDirectoryDurability(),
  });
}
