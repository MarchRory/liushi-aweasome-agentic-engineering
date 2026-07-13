import { describe, expect, it } from "vitest";

import {
  CodingTaskAttemptOutcome,
  CodingTaskCellRevisionBinding,
  CodingTaskCellVerificationBindingService,
  CodingTaskPhase,
  CodingTaskRunState,
  CodingTaskVerificationOutcome,
  FailureTaxonomy,
  ResultStatus,
  VERIFICATION_PLAN_SCHEMA_VERSION,
  VERIFICATION_RUN_COMMAND_TYPE,
  VerificationKind,
  VerificationRequirement,
  parseCodingTaskId,
  parseContentDigest,
  parseRepositoryId,
  parseTaskId,
  parseWorkspaceId,
  success,
  type CodingTaskAggregate,
  type CodingTaskCellVerificationBindingInput,
  type CodingTaskRepository,
  type CommandEnvelope,
} from "../../src/index.js";
import { Rfc8785Sha256DigestAdapter } from "../../src/infrastructure/index.js";

const digest = new Rfc8785Sha256DigestAdapter();

describe("CodingTask Cell Verification Binding Service", () => {
  it("Active Verification 首次物化权威 Revision 并重算最终 Digest", async () => {
    const input = bindingInput();
    const service = createService(aggregate());

    const result = await service.bind(input);

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Success) {
      expect(result.value.payload.plan.targetRevision).toBe("target-revision-1");
      expect(result.value.requestDigest).toBe(calculateDigest(result.value.payload));
      expect(result.value.commandId).toBe(input.command.commandId);
    }
  });

  it("Completed Passed 的同一 Attempt 重放物化完全相同命令", async () => {
    const input = bindingInput();
    const first = await createService(aggregate()).bind(input);
    const replay = await createService(
      aggregate({
        runState: CodingTaskRunState.Completed,
        verificationOutcome: CodingTaskVerificationOutcome.Passed,
      }),
    ).bind(input);

    expect(first.status).toBe(ResultStatus.Success);
    expect(replay).toEqual(first);
  });

  it.each([
    ["缺失权威 Revision", { targetRevision: undefined }],
    ["Workspace identity 不匹配", { workspaceId: "other-workspace" }],
    ["Repository identity 不匹配", { repositoryId: "other-repository" }],
    ["Worktree identity 不匹配", { worktreeId: "other-worktree" }],
    ["Branch identity 不匹配", { branchName: "other-branch" }],
    ["Base identity 不匹配", { baseRevision: "other-base" }],
    ["Attempt identity 不匹配", { attemptNumber: 2 }],
    ["状态不允许", { runState: CodingTaskRunState.WaitingHuman }],
    ["完成但未通过", { runState: CodingTaskRunState.Completed }],
  ])("%s 时 fail closed", async (_name, overrides) => {
    const result = await createService(aggregate(overrides)).bind(bindingInput());

    expect(result.status).toBe(ResultStatus.Failure);
  });
});

/** 构造测试 Aggregate 时允许覆盖的权威字段。 */
interface AggregateOverrides {
  readonly workspaceId?: string;
  readonly repositoryId?: string;
  readonly worktreeId?: string;
  readonly branchName?: string;
  readonly baseRevision?: string;
  readonly attemptNumber?: number;
  readonly targetRevision?: string | undefined;
  readonly runState?: CodingTaskRunState;
  readonly verificationOutcome?: CodingTaskVerificationOutcome;
}

/** 创建满足 Binding 前置状态的权威 CodingTask Aggregate。 */
function aggregate(overrides: AggregateOverrides = {}): CodingTaskAggregate {
  return {
    schemaVersion: "1.0.0",
    codingTaskId: unwrap(parseCodingTaskId("coding-task-cell-1")),
    workspaceId: unwrap(parseWorkspaceId(overrides.workspaceId ?? "workspace-1")),
    sourceTaskId: unwrap(parseTaskId("01ARZ3NDEKTSV4RRFFQ69G5FB2")),
    repositoryId: unwrap(parseRepositoryId(overrides.repositoryId ?? "repository-1")),
    baseRevision: overrides.baseRevision ?? "base-revision-1",
    worktreeBinding: {
      worktreeId: overrides.worktreeId ?? "worktree-1",
      relativePath: "worktrees/task",
      branchName: overrides.branchName ?? "feature/cell",
      managed: true,
    },
    writeSet: ["src/index.ts"],
    inputBindingSet: { bindings: [] },
    executionAuthorization: {} as CodingTaskAggregate["executionAuthorization"],
    phase: CodingTaskPhase.Verification,
    runState: overrides.runState ?? CodingTaskRunState.Active,
    attempts: [
      {
        number: overrides.attemptNumber ?? 1,
        startedAt: "2026-07-14T00:00:00.000Z",
        finishedAt: "2026-07-14T00:00:01.000Z",
        outcome: CodingTaskAttemptOutcome.Succeeded,
        ...(overrides.targetRevision === undefined && "targetRevision" in overrides
          ? {}
          : { targetRevision: overrides.targetRevision ?? "target-revision-1" }),
        changedPaths: ["src/index.ts"],
        ...(overrides.verificationOutcome === undefined
          ? {}
          : { verificationOutcome: overrides.verificationOutcome }),
      },
    ],
    version: overrides.runState === CodingTaskRunState.Completed ? 5 : 4,
    createdAt: "2026-07-14T00:00:00.000Z",
    updatedAt: "2026-07-14T00:00:02.000Z",
  };
}

function createService(aggregateValue: CodingTaskAggregate) {
  const repository = {
    load: () =>
      Promise.resolve(
        success({
          aggregate: aggregateValue,
          lastSequence: aggregateValue.version,
          lastEventHash: "hash",
        }),
      ),
  } as unknown as CodingTaskRepository;
  return new CodingTaskCellVerificationBindingService(repository, digest);
}

function bindingInput(): CodingTaskCellVerificationBindingInput {
  const payload = {
    workspaceId: "workspace-1",
    actionId: "01ARZ3NDEKTSV4RRFFQ69G5FB1",
    verificationRunId: "verification-run-1",
    attemptNumber: 1,
    worktreeRootDigest: unwrap(parseContentDigest(`sha256:${"b".repeat(64)}`)),
    plan: {
      schemaVersion: VERIFICATION_PLAN_SCHEMA_VERSION,
      planId: "plan-1",
      repositoryId: unwrap(parseRepositoryId("repository-1")),
      worktreeId: "worktree-1",
      expectedBranchName: "feature/cell",
      baseRevision: "base-revision-1",
      checks: [
        {
          checkId: "check-1",
          kind: VerificationKind.Typecheck,
          requirement: VerificationRequirement.Required,
          command: {
            executable: "node",
            args: ["--version"],
            workingDirectory: "",
            allowedEnvironmentKeys: [],
          },
          timeoutMs: 1_000,
          retryable: false,
        },
      ],
    },
    failedVerificationTaxonomy: FailureTaxonomy.ImplementationDefect,
  };
  return {
    binding: CodingTaskCellRevisionBinding.LatestImplementationCheckpoint,
    command: {
      schemaVersion: "1.0.0",
      commandId: "verification",
      commandType: VERIFICATION_RUN_COMMAND_TYPE,
      aggregateType: "coding_task",
      aggregateId: "coding-task-cell-1",
      expectedVersion: 4,
      idempotencyKey: "verification",
      requestDigest: unwrap(parseContentDigest(calculateDigest(payload))),
      actor: { kind: "agent", actorId: "agent-1" },
      authorizationContext: {},
      correlationId: "cell-correlation-1",
      submittedAt: "2026-07-14T00:00:00.000Z",
      payload,
    } as CommandEnvelope<typeof payload>,
  };
}

function calculateDigest(value: unknown): string {
  const result = digest.calculate(value);
  if (result.status === ResultStatus.Failure) throw result.error;
  return result.value;
}

function unwrap<T>(result: { status: ResultStatus; value?: T; error?: Error }): T {
  if (result.status !== ResultStatus.Success || result.value === undefined) {
    throw new Error(result.error?.message ?? "测试值解析失败。");
  }
  return result.value;
}
