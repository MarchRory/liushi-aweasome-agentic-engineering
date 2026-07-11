import { readdir } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import {
  ActorKind,
  HarnessErrorCode,
  ResultStatus,
  createHarnessApplication,
} from "../../src/index.js";
import {
  FixedClock,
  FixedSequenceIdGenerator,
  TemporaryRuntimeStore,
} from "../support/runtime/index.js";

const TASK_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const EVENT_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAW";
const ACTOR = { kind: ActorKind.Human, actorId: "tester" };
const runtimeStores = new TemporaryRuntimeStore();

afterEach(async () => runtimeStores.cleanup());

describe("create 输入校验", () => {
  it("拒绝非法 workspaceId 且不写入 runtime store", async () => {
    const storeRoot = await runtimeStores.create("liushi-create-invalid-workspace-");
    const app = createHarnessApplication({
      storeRoot,
      clock: new FixedClock("2026-07-11T00:00:00.000Z"),
      taskIdGenerator: new FixedSequenceIdGenerator([TASK_ID]),
      eventIdGenerator: new FixedSequenceIdGenerator([EVENT_ID]),
    });

    const result = await app.createTask.execute({
      workspaceId: "../bad",
      actor: ACTOR,
    });

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Failure) {
      expect(result.error.code).toBe(HarnessErrorCode.InvalidInput);
      expect(result.error.details).toEqual({ field: "workspaceId" });
    }
    await expect(readdir(storeRoot)).resolves.toEqual([]);
  });

  it.each([
    ["空白 source", "   "],
    ["超过 2048 字符 source", "x".repeat(2_049)],
  ])("拒绝%s且不写入 runtime store", async (_caseName, source) => {
    const storeRoot = await runtimeStores.create("liushi-create-invalid-source-");
    const app = createHarnessApplication({
      storeRoot,
      clock: new FixedClock("2026-07-11T00:00:00.000Z"),
      taskIdGenerator: new FixedSequenceIdGenerator([TASK_ID]),
      eventIdGenerator: new FixedSequenceIdGenerator([EVENT_ID]),
    });

    const result = await app.createTask.execute({
      workspaceId: "workspace-a",
      source,
      actor: ACTOR,
    });

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Failure) {
      expect(result.error.code).toBe(HarnessErrorCode.InvalidInput);
      expect(result.error.details).toEqual({ field: "source" });
    }
    await expect(readdir(storeRoot)).resolves.toEqual([]);
  });

  it.each([
    ["空白 actorId", { kind: ActorKind.Human, actorId: "   " }, "actor.actorId"],
    [
      "超过 128 字符的 actorId",
      { kind: ActorKind.Human, actorId: "a".repeat(129) },
      "actor.actorId",
    ],
    ["运行时非对象 Actor", "not-an-actor", "actor"],
  ] as const)("拒绝%s且不写入 runtime store", async (_caseName, actor, invalidField) => {
    const storeRoot = await runtimeStores.create("liushi-create-invalid-actor-");
    const app = createHarnessApplication({
      storeRoot,
      clock: new FixedClock("2026-07-11T00:00:00.000Z"),
      taskIdGenerator: new FixedSequenceIdGenerator([TASK_ID]),
      eventIdGenerator: new FixedSequenceIdGenerator([EVENT_ID]),
    });

    const result = await app.createTask.execute({
      workspaceId: "workspace-a",
      actor: actor as never,
    });

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Failure) {
      expect(result.error.code).toBe(HarnessErrorCode.InvalidInput);
      expect(result.error.details).toEqual({ field: invalidField });
    }
    await expect(readdir(storeRoot)).resolves.toEqual([]);
  });

  it("创建时裁剪合法 source 并返回初始状态", async () => {
    const storeRoot = await runtimeStores.create("liushi-create-valid-");
    const app = createHarnessApplication({
      storeRoot,
      clock: new FixedClock("2026-07-11T00:00:00.000Z"),
      taskIdGenerator: new FixedSequenceIdGenerator([TASK_ID]),
      eventIdGenerator: new FixedSequenceIdGenerator([EVENT_ID]),
    });

    const result = await app.createTask.execute({
      workspaceId: "workspace-a",
      source: "  ticket-123  ",
      actor: ACTOR,
    });

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Success) {
      expect(result.value.task).toMatchObject({
        taskId: TASK_ID,
        workspaceId: "workspace-a",
        source: "ticket-123",
      });
    }
  });
});
