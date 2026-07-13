import { describe, expect, it, vi } from "vitest";

import {
  ActionJournalStatus,
  ActionKind,
  ActorKind,
  CODING_TASK_AGGREGATE_TYPE,
  COMMAND_ENVELOPE_SCHEMA_VERSION,
  CodingTaskPhase,
  CodingTaskRunState,
  FailureTaxonomy,
  FileMutationKind,
  HarnessErrorCode,
  IMPLEMENTATION_APPLY_COMMAND_TYPE,
  IMPLEMENTATION_SUBMIT_COMMAND_TYPE,
  ImplementationCommandHandler,
  ImplementationSubmissionHandler,
  ResultStatus,
  UnresolvedWorktreeProvisionGuard,
  VERIFICATION_PLAN_SCHEMA_VERSION,
  VERIFICATION_RUN_COMMAND_TYPE,
  VerificationCommandHandler,
  VerificationKind,
  VerificationRequirement,
  WORKTREE_PROVISION_COMMAND_TYPE,
  WorktreeProvisionCommandHandler,
  success,
  type ActionIntentRecord,
  type ActionJournalRepository,
  type CodingTaskAggregate,
  type CodingTaskCommandHandler,
  type CodingTaskExecutionAuthorizationResolver,
  type CodingTaskRepository,
  type CommandEnvelope,
  type ContentDigest,
  type EvidenceBundleStore,
  type FileMutationExecutorPort,
  type GitCheckpointPort,
  type JournaledActionRunner,
  type RepositoryLockPort,
  type RepositoryRootResolverPort,
  type VerificationActionExecutor,
  type WorktreeProvisionerPort,
} from "../../src/index.js";
import { Rfc8785Sha256DigestAdapter } from "../../src/infrastructure/index.js";

const digest = new Rfc8785Sha256DigestAdapter();
const runtime = { repositoryRoot: "C:\\repository" };
const verificationRuntime = { worktreeRoot: "C:\\repository\\.worktrees\\task" };
const commandActionId = "01ARZ3NDEKTSV4RRFFQ69G5FB1";
const provisionActionId = "01ARZ3NDEKTSV4RRFFQ69G5FB2";

describe("四个 Handler 的 Worktree Provision Guard 注入", () => {
  it("阻断 Provisioner 调用", async () => {
    const setup = createSetup(implementationAggregate());
    const execute = vi.fn<WorktreeProvisionerPort["execute"]>();
    const payload = {
      workspaceId: setup.aggregate.workspaceId,
      actionId: commandActionId,
      repositoryRootDigest: calculateDigest(runtime),
    };
    const handler = new WorktreeProvisionCommandHandler(
      setup.repository,
      setup.authorization,
      setup.lock,
      setup.runner,
      { execute },
      digest,
      setup.guard,
    );

    const result = await handler.execute(
      command(WORKTREE_PROVISION_COMMAND_TYPE, payload),
      runtime,
    );

    expectBlocked(result);
    expect(setup.runnerExecute).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    expect(setup.release).toHaveBeenCalledOnce();
  });

  it("阻断文件 Executor 调用", async () => {
    const setup = createSetup(implementationAggregate());
    const execute = vi.fn<FileMutationExecutorPort["execute"]>();
    const content = "export const guarded = true;\n";
    const payload = {
      workspaceId: setup.aggregate.workspaceId,
      actionId: commandActionId,
      attemptNumber: 1,
      runtimeRootDigest: calculateDigest(runtime),
      mutations: [
        {
          path: "src/index.ts",
          kind: FileMutationKind.Create,
          content,
          contentDigest: calculateDigest(content),
        },
      ],
    };
    const handler = new ImplementationCommandHandler(
      setup.repository,
      setup.authorization,
      setup.lock,
      setup.runner,
      { execute },
      digest,
      setup.guard,
    );

    const result = await handler.execute(
      command(IMPLEMENTATION_APPLY_COMMAND_TYPE, payload),
      runtime,
    );

    expectBlocked(result);
    expect(setup.runnerExecute).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    expect(setup.release).toHaveBeenCalledOnce();
  });

  it("阻断 Checkpoint inspect 与 execute 调用", async () => {
    const setup = createSetup(implementationAggregate());
    const execute = vi.fn<GitCheckpointPort["execute"]>();
    const inspect = vi.fn<GitCheckpointPort["inspect"]>();
    const resolve = vi.fn<RepositoryRootResolverPort["resolve"]>();
    const payload = {
      workspaceId: setup.aggregate.workspaceId,
      actionId: commandActionId,
      attemptNumber: 1,
      repositoryRootDigest: calculateDigest(runtime),
    };
    const handler = new ImplementationSubmissionHandler(
      setup.repository,
      setup.authorization,
      { resolve },
      setup.lock,
      setup.runner,
      { execute, inspect },
      {} as CodingTaskCommandHandler,
      digest,
      setup.guard,
    );

    const result = await handler.execute(
      command(IMPLEMENTATION_SUBMIT_COMMAND_TYPE, payload),
      runtime,
    );

    expectBlocked(result);
    expect(setup.runnerExecute).not.toHaveBeenCalled();
    expect(resolve).not.toHaveBeenCalled();
    expect(inspect).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    expect(setup.release).toHaveBeenCalledOnce();
  });

  it("阻断 Verification Executor 调用", async () => {
    const setup = createSetup(verificationAggregate());
    const execute = vi.fn<VerificationActionExecutor["execute"]>();
    const plan = verificationPlan(setup.aggregate);
    const payload = {
      workspaceId: setup.aggregate.workspaceId,
      actionId: commandActionId,
      verificationRunId: "verification-run-1",
      attemptNumber: 1,
      worktreeRootDigest: calculateDigest(verificationRuntime),
      plan,
      failedVerificationTaxonomy: FailureTaxonomy.ImplementationDefect,
    };
    const handler = new VerificationCommandHandler(
      setup.repository,
      setup.authorization,
      setup.lock,
      setup.runner,
      { execute } as unknown as VerificationActionExecutor,
      {} as EvidenceBundleStore,
      {} as CodingTaskCommandHandler,
      digest,
      setup.guard,
    );

    const result = await handler.execute(
      command(VERIFICATION_RUN_COMMAND_TYPE, payload),
      verificationRuntime,
    );

    expectBlocked(result);
    expect(setup.runnerExecute).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    expect(setup.release).toHaveBeenCalledOnce();
  });
});

function createSetup(aggregate: CodingTaskAggregate) {
  const release = vi.fn(() => Promise.resolve(success(undefined)));
  const repository = {
    load: vi.fn(() =>
      Promise.resolve(
        success({ aggregate, lastSequence: aggregate.version, lastEventHash: "hash" }),
      ),
    ),
  } as unknown as CodingTaskRepository;
  const authorization = {
    resolve: vi.fn(({ requested }) => Promise.resolve(success(requested))),
  } as CodingTaskExecutionAuthorizationResolver;
  const lock = {
    acquire: vi.fn(() =>
      Promise.resolve(
        success({
          lockId: "lock-1",
          workspaceId: aggregate.workspaceId,
          repositoryId: aggregate.repositoryId,
          acquiredAt: "2026-07-14T00:00:00.000Z",
          release,
        }),
      ),
    ),
  } as RepositoryLockPort;
  const runnerExecute = vi.fn<JournaledActionRunner["execute"]>();
  const runner = { execute: runnerExecute } as unknown as JournaledActionRunner;
  const actionJournal = {
    listRecoverable: vi.fn(() =>
      Promise.resolve(
        success([
          {
            intent: provisionIntent(aggregate),
            observations: [],
            resolutions: [],
            lastSequence: 1,
            status: ActionJournalStatus.WaitingHuman,
          },
        ]),
      ),
    ),
  } as unknown as ActionJournalRepository;
  return {
    aggregate,
    repository,
    authorization,
    lock,
    runner,
    runnerExecute,
    release,
    guard: new UnresolvedWorktreeProvisionGuard(actionJournal, digest),
  };
}

function implementationAggregate(): CodingTaskAggregate {
  return aggregate(CodingTaskPhase.Implementation, [
    { number: 1, startedAt: "2026-07-14T00:00:00.000Z" },
  ]);
}

function verificationAggregate(): CodingTaskAggregate {
  return aggregate(CodingTaskPhase.Verification, [
    {
      number: 1,
      startedAt: "2026-07-14T00:00:00.000Z",
      targetRevision: "target-revision-1",
    },
  ]);
}

function aggregate(phase: CodingTaskPhase, attempts: CodingTaskAggregate["attempts"]) {
  return {
    codingTaskId: "coding-task-1",
    workspaceId: "workspace-1",
    sourceTaskId: "source-task-1",
    repositoryId: "repository-1",
    baseRevision: "base-revision-1",
    worktreeBinding: {
      worktreeId: "worktree-1",
      relativePath: ".worktrees/coding-task-1",
      branchName: "feature/coding-task-1",
      managed: true,
    },
    writeSet: ["src/index.ts"],
    executionAuthorization: {},
    phase,
    runState: CodingTaskRunState.Active,
    attempts,
    version: 1,
  } as unknown as CodingTaskAggregate;
}

function provisionIntent(aggregateValue: CodingTaskAggregate): ActionIntentRecord {
  return {
    actionId: provisionActionId,
    workspaceId: aggregateValue.workspaceId,
    taskId: aggregateValue.sourceTaskId,
    kind: ActionKind.GitMutation,
    target: JSON.stringify({
      repositoryId: aggregateValue.repositoryId,
      worktreeId: aggregateValue.worktreeBinding.worktreeId,
      relativePath: aggregateValue.worktreeBinding.relativePath,
      branchName: aggregateValue.worktreeBinding.branchName,
    }),
    postconditionDigest: calculateDigest({
      repositoryId: aggregateValue.repositoryId,
      worktreeBinding: aggregateValue.worktreeBinding,
      baseRevision: aggregateValue.baseRevision,
    }),
    baseRevision: aggregateValue.baseRevision,
  } as ActionIntentRecord;
}

function verificationPlan(aggregateValue: CodingTaskAggregate) {
  return {
    schemaVersion: VERIFICATION_PLAN_SCHEMA_VERSION,
    planId: "plan-1",
    repositoryId: aggregateValue.repositoryId,
    worktreeId: aggregateValue.worktreeBinding.worktreeId,
    expectedBranchName: aggregateValue.worktreeBinding.branchName,
    baseRevision: aggregateValue.baseRevision,
    targetRevision: "target-revision-1",
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
  };
}

function command<T>(commandType: string, payload: T): CommandEnvelope<T> {
  return {
    schemaVersion: COMMAND_ENVELOPE_SCHEMA_VERSION,
    commandId: `command-${commandType}`,
    commandType,
    aggregateType: CODING_TASK_AGGREGATE_TYPE,
    aggregateId: "coding-task-1",
    expectedVersion: 1,
    idempotencyKey: `idempotency-${commandType}`,
    requestDigest: calculateDigest(payload),
    actor: { kind: ActorKind.Human, actorId: "human-1" },
    authorizationContext: {},
    correlationId: "correlation-1",
    submittedAt: "2026-07-14T00:00:00.000Z",
    payload,
  };
}

function calculateDigest(input: unknown): ContentDigest {
  const calculated = digest.calculate(input);
  if (calculated.status === ResultStatus.Failure) throw calculated.error;
  return calculated.value;
}

function expectBlocked(result: {
  readonly status: ResultStatus;
  readonly error?: { code: HarnessErrorCode };
}): void {
  expect(result.status).toBe(ResultStatus.Failure);
  if (result.status === ResultStatus.Failure)
    expect(result.error?.code).toBe(HarnessErrorCode.PreconditionNotMet);
}
