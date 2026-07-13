import { describe, expect, it } from "vitest";
import { ActorKind, HarnessErrorCode, ResultStatus } from "#common/index.js";
import { CodingTaskCommandType, parseCodingTaskPayload } from "#application/index.js";
import { CodingTaskCommandHandler } from "#application/codingTask/handler/codingTaskCommandHandler.js";
import type { CodingTaskCommandPayload } from "#application/codingTask/commands/index.js";
import { parseCommandEnvelope, type CommandEnvelope } from "#application/command/index.js";

const validCreate = {
  workspaceId: "workspace-1",
  sourceTaskId: "01ARZ3NDEKTSV4RRFFQ69G5FB2",
  repositoryId: "repo-1",
  baseRevision: "main-1",
  worktreeBinding: {
    worktreeId: "tree-1",
    relativePath: "work",
    branchName: "task-1",
    managed: true,
  },
  writeSet: ["src/index.ts"],
  inputBindingSet: { bindings: [] },
  executionAuthorization: {
    planRisk: {
      artifactId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      artifactDigest: `sha256:${"1".repeat(64)}`,
      result: "allow",
      requiredGates: [],
      satisfiedApprovalIds: [],
    },
    historicalLogicChange: false,
  },
};

describe("CodingTask Command 契约", () => {
  it("CodingTaskCommandHandler 公开 execute 拒绝 SubmitImplementation", async () => {
    const handler = new CodingTaskCommandHandler(
      {} as ConstructorParameters<typeof CodingTaskCommandHandler>[0],
      { now: () => new Date("2026-07-12T00:00:00.000Z") },
      { next: () => "01ARZ3NDEKTSV4RRFFQ69G5FB3" },
      {} as ConstructorParameters<typeof CodingTaskCommandHandler>[3],
    );

    const parsed = parseCommandEnvelope({
      schemaVersion: "1.0.0",
      commandId: "coding-submit-public",
      commandType: CodingTaskCommandType.SubmitImplementation,
      aggregateType: "coding_task",
      aggregateId: "coding-task-1",
      expectedVersion: 2,
      idempotencyKey: "coding-submit-public",
      requestDigest: `sha256:${"a".repeat(64)}`,
      actor: { kind: ActorKind.Agent, actorId: "agent" },
      authorizationContext: {},
      correlationId: "coding-task-correlation",
      submittedAt: "2026-07-12T00:00:00.000Z",
      payload: {
        workspaceId: "workspace-1",
        attemptNumber: 1,
        targetRevision: "revision-2",
        changedPaths: ["src/a.ts"],
      },
    });
    if (parsed.status === ResultStatus.Failure) throw parsed.error;
    const result = await handler.execute(parsed.value as CommandEnvelope<CodingTaskCommandPayload>);

    expect(result).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.OperationForbidden },
    });
  });

  it("拒绝 Create 的未知字段", () => {
    const result = parseCodingTaskPayload(CodingTaskCommandType.Create, {
      ...validCreate,
      extra: true,
    });
    expect(result.status).toBe(ResultStatus.Failure);
  });

  it("保留枚举 payload 并拒绝缺少 attemptNumber", () => {
    const result = parseCodingTaskPayload(CodingTaskCommandType.StartAttempt, {
      workspaceId: "workspace-1",
    });
    expect(result.status).toBe(ResultStatus.Failure);
  });

  it("校验 SubmitImplementation 并保留 changedPaths 顺序", () => {
    const result = parseCodingTaskPayload(CodingTaskCommandType.SubmitImplementation, {
      workspaceId: "workspace-1",
      attemptNumber: 1,
      targetRevision: "revision-2",
      changedPaths: ["src/z.ts", "src/a.ts"],
    });

    expect(result).toMatchObject({
      status: ResultStatus.Success,
      value: { changedPaths: ["src/z.ts", "src/a.ts"] },
    });
  });

  it.each([
    { changedPaths: [] },
    { changedPaths: ["../src/a.ts"] },
    { changedPaths: ["src\\a.ts"] },
  ])("拒绝无效的 SubmitImplementation changedPaths：%j", ({ changedPaths }) => {
    const result = parseCodingTaskPayload(CodingTaskCommandType.SubmitImplementation, {
      workspaceId: "workspace-1",
      attemptNumber: 1,
      targetRevision: "revision-2",
      changedPaths,
    });

    expect(result.status).toBe(ResultStatus.Failure);
  });
});
