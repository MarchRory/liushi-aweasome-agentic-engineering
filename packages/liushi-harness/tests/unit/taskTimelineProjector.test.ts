import { describe, expect, it } from "vitest";

import {
  ActorKind,
  HarnessErrorCode,
  ResultStatus,
  createInitialTaskState,
  parseEventId,
  parseTaskId,
  parseWorkspaceId,
  projectTaskTimeline,
} from "../../src/index.js";
import { createTaskCreatedEvent } from "../../src/infrastructure/persistence/fileEventStore/eventLog/index.js";
import { FixedSequenceIdGenerator } from "../support/runtime/index.js";

describe("Task Timeline Projector", () => {
  it("从已校验 TaskCreated Event 生成稳定只读 Projection", () => {
    const event = createTaskCreatedEvent(createTaskState(), eventIds());
    expect(event.status).toBe(ResultStatus.Success);
    if (event.status !== ResultStatus.Success) {
      throw event.error;
    }

    const result = projectTaskTimeline([event.value]);

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Success) {
      expect(result.value).toMatchObject({
        schemaVersion: "1.0.0",
        workspaceId: "workspace-a",
        taskId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
        lastSequence: 1,
        entries: [
          {
            sequence: 1,
            kind: "task_created",
            source: "ticket-a",
          },
        ],
      });
    }
  });

  it("空历史和断裂 Hash Chain 均 fail closed", () => {
    const empty = projectTaskTimeline([]);
    const first = createTaskCreatedEvent(createTaskState(), eventIds());
    expect(first.status).toBe(ResultStatus.Success);
    if (first.status !== ResultStatus.Success) {
      throw first.error;
    }
    const broken = projectTaskTimeline([
      first.value,
      {
        ...first.value,
        eventId: parseEventIdForTest("01ARZ3NDEKTSV4RRFFQ69G5FAX"),
        sequence: 2,
        previousHash: "broken",
      },
    ]);

    expect(empty.status).toBe(ResultStatus.Failure);
    expect(broken.status).toBe(ResultStatus.Failure);
    if (empty.status === ResultStatus.Failure && broken.status === ResultStatus.Failure) {
      expect(empty.error.code).toBe(HarnessErrorCode.CorruptStore);
      expect(broken.error.code).toBe(HarnessErrorCode.CorruptStore);
    }
  });
});

function createTaskState() {
  const taskId = parseTaskId("01ARZ3NDEKTSV4RRFFQ69G5FAV");
  const workspaceId = parseWorkspaceId("workspace-a");
  if (taskId.status !== ResultStatus.Success || workspaceId.status !== ResultStatus.Success) {
    throw new Error("Timeline 测试 ID 必须有效。");
  }
  return createInitialTaskState({
    taskId: taskId.value,
    workspaceId: workspaceId.value,
    source: "ticket-a",
    actor: { kind: ActorKind.Human, actorId: "timeline-test" },
    occurredAt: "2026-07-12T00:00:00.000Z",
  });
}

function eventIds(): FixedSequenceIdGenerator {
  return new FixedSequenceIdGenerator(["01ARZ3NDEKTSV4RRFFQ69G5FAW"]);
}

function parseEventIdForTest(value: string) {
  const result = parseEventId(value);
  if (result.status !== ResultStatus.Success) {
    throw result.error;
  }
  return result.value;
}
