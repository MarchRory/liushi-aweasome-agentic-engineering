import { afterEach, describe, expect, it } from "vitest";

import {
  ActorKind,
  CommandErrorCode,
  CommandStatus,
  CodingTaskAttemptOutcome,
  CodingTaskCommandType,
  CodingTaskVerificationOutcome,
  ResultStatus,
  createHarnessApplication,
  parseCodingTaskId,
  parseWorkspaceId,
} from "../../src/index.js";
import {
  ExclusiveFileLockManager,
  FileCodingTaskRepository,
  FileParentDirectoryDurability,
} from "../../src/infrastructure/index.js";
import { TemporaryRuntimeStore } from "../support/runtime/index.js";

const workspaceId = "coding-task-command-workspace";
const codingTaskId = "coding-task-command-1";
const submittedAt = "2026-07-12T00:00:00.000Z";
const runtimeStores = new TemporaryRuntimeStore();

afterEach(async () => runtimeStores.cleanup());

describe("CodingTask Command Gateway 纵向链路", () => {
  it("通过 Gateway 创建、实现、验证并 Replay 到 Completed", async () => {
    const root = await runtimeStores.create("liushi-coding-task-command-");
    const application = createHarnessApplication({
      storeRoot: root,
      codingTaskAuthorizationResolver: {
        resolve: ({ requested }) =>
          Promise.resolve({ status: ResultStatus.Success, value: requested }),
      },
    });
    const create = command(
      CodingTaskCommandType.Create,
      "coding-create-1",
      0,
      ActorKind.Human,
      createPayload(),
    );

    const created = await application.codingTaskCommands.execute(create);
    expect(created).toMatchObject({
      status: ResultStatus.Success,
      value: { status: CommandStatus.Committed, committedVersion: 1 },
    });
    expect(await application.codingTaskCommands.execute(create)).toEqual(created);

    expect(
      await application.codingTaskCommands.execute(
        command(CodingTaskCommandType.StartAttempt, "coding-start-1", 1, ActorKind.Agent, {
          workspaceId,
          attemptNumber: 1,
        }),
      ),
    ).toMatchObject({ value: { status: CommandStatus.Committed, committedVersion: 2 } });
    expect(
      await application.codingTaskCommands.execute(
        command(CodingTaskCommandType.FinishAttempt, "coding-finish-1", 2, ActorKind.Agent, {
          workspaceId,
          attemptNumber: 1,
          outcome: CodingTaskAttemptOutcome.Succeeded,
        }),
      ),
    ).toMatchObject({ value: { status: CommandStatus.Committed, committedVersion: 3 } });
    expect(
      await application.codingTaskCommands.execute(
        command(
          CodingTaskCommandType.RequestVerification,
          "coding-request-verification-1",
          3,
          ActorKind.Agent,
          { workspaceId, attemptNumber: 1 },
        ),
      ),
    ).toMatchObject({ value: { status: CommandStatus.Committed, committedVersion: 4 } });
    expect(
      await application.codingTaskCommands.execute(
        command(
          CodingTaskCommandType.FinishVerification,
          "coding-finish-verification-1",
          4,
          ActorKind.Agent,
          {
            workspaceId,
            attemptNumber: 1,
            outcome: CodingTaskVerificationOutcome.Passed,
          },
        ),
      ),
    ).toMatchObject({ value: { status: CommandStatus.Committed, committedVersion: 5 } });

    const repository = new FileCodingTaskRepository(root, {
      lockManager: new ExclusiveFileLockManager(),
      parentDirectoryDurability: new FileParentDirectoryDurability(),
    });
    const loaded = await repository.load({
      workspaceId: unwrap(parseWorkspaceId(workspaceId)),
      codingTaskId: unwrap(parseCodingTaskId(codingTaskId)),
    });
    expect(loaded).toMatchObject({
      status: ResultStatus.Success,
      value: { aggregate: { runState: "completed", phase: "verification", version: 5 } },
    });
  });

  it("风险控制命令必须由 Human 发起", async () => {
    const root = await runtimeStores.create("liushi-coding-task-human-");
    const application = createHarnessApplication({
      storeRoot: root,
      codingTaskAuthorizationResolver: {
        resolve: ({ requested }) =>
          Promise.resolve({ status: ResultStatus.Success, value: requested }),
      },
    });
    await application.codingTaskCommands.execute(
      command(
        CodingTaskCommandType.Create,
        "coding-create-human",
        0,
        ActorKind.Human,
        createPayload(),
      ),
    );

    const rejected = await application.codingTaskCommands.execute(
      command(CodingTaskCommandType.Control, "coding-control-agent", 1, ActorKind.Agent, {
        workspaceId,
        action: "pause",
      }),
    );
    expect(rejected).toMatchObject({
      status: ResultStatus.Success,
      value: { status: CommandStatus.Rejected },
    });
  });

  it("默认授权解析器拒绝不存在上游 Task 的自报授权", async () => {
    const root = await runtimeStores.create("liushi-coding-task-authorization-");
    const application = createHarnessApplication({ storeRoot: root });
    const rejected = await application.codingTaskCommands.execute(
      command(
        CodingTaskCommandType.Create,
        "coding-create-untrusted",
        0,
        ActorKind.Agent,
        createPayload(),
      ),
    );

    expect(rejected).toMatchObject({
      status: ResultStatus.Success,
      value: { status: CommandStatus.Rejected, errorCode: CommandErrorCode.AuthorizationDenied },
    });
  });
});

function createPayload() {
  return {
    workspaceId,
    sourceTaskId: "01ARZ3NDEKTSV4RRFFQ69G5FB2",
    repositoryId: "repo-1",
    baseRevision: "main-1",
    worktreeBinding: {
      worktreeId: "worktree-1",
      relativePath: "worktrees/coding-task-1",
      branchName: "feature/coding-task-1",
      managed: true,
    },
    writeSet: ["src/index.ts"],
    inputBindingSet: { bindings: [] },
    executionAuthorization: {
      planRisk: {
        artifactId: "01ARZ3NDEKTSV4RRFFQ69G5FAW",
        artifactDigest: `sha256:${"1".repeat(64)}`,
        result: "allow",
        requiredGates: [],
        satisfiedApprovalIds: [],
      },
      historicalLogicChange: false,
    },
  };
}

function command(
  commandType: CodingTaskCommandType,
  commandId: string,
  expectedVersion: number,
  actorKind: ActorKind,
  payload: unknown,
) {
  return {
    schemaVersion: "1.0.0",
    commandId,
    commandType,
    aggregateType: "coding_task",
    aggregateId: codingTaskId,
    expectedVersion,
    idempotencyKey: commandId,
    requestDigest: `sha256:${"a".repeat(64)}`,
    actor: {
      kind: actorKind,
      actorId: actorKind === ActorKind.Human ? "human" : "agent",
    },
    authorizationContext: {},
    correlationId: "coding-task-correlation",
    submittedAt,
    payload,
  };
}

function unwrap<T>(result: { status: ResultStatus; value?: T; error?: Error }): T {
  if (result.status !== ResultStatus.Success || result.value === undefined) {
    throw new Error(result.error?.message ?? "解析测试标识失败。");
  }
  return result.value;
}
