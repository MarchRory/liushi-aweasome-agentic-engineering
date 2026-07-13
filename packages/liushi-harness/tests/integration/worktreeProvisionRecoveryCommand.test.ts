import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import {
  ACTION_JOURNAL_SCHEMA_VERSION,
  ActorKind,
  ActionJournalRecordType,
  ActionJournalStatus,
  ActionKind,
  ActionOutcome,
  ActionResolution,
  CodingTaskCommandType,
  CommandStatus,
  ResultStatus,
  WORKTREE_PROVISION_RECOVERY_SCHEMA_VERSION,
  WORKTREE_PROVISION_RECONCILE_COMMAND_TYPE,
  WorktreeProvisionRecoveryInspectionStatus,
  createHarnessApplication,
} from "../../src/index.js";
import {
  NodeCommandRunnerAdapter,
  Rfc8785Sha256DigestAdapter,
  StaticRepositoryRootResolverAdapter,
} from "../../src/infrastructure/index.js";
import { TemporaryRuntimeStore } from "../support/runtime/index.js";

const runtimeStores = new TemporaryRuntimeStore();
const repositories: string[] = [];
const workspaceId = "worktree-recovery-workspace";
const repositoryId = "repo-1";
const codingTaskId = "worktree-recovery-task";
const sourceTaskId = "01ARZ3NDEKTSV4RRFFQ69G5FB2";
const actionId = "01ARZ3NDEKTSV4RRFFQ69G5FC1";
const submittedAt = "2026-07-14T00:00:00.000Z";
const digest = new Rfc8785Sha256DigestAdapter();

afterEach(async () => {
  await runtimeStores.cleanup();
  await Promise.all(
    repositories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("Worktree Provision Recovery Command", () => {
  it("由 Human 将已经满足后置条件的 Worktree 恢复为 Recovered，并跨实例复用 Receipt", async () => {
    const fixture = await setupFixture("applied");
    await createManagedWorktree(fixture.repositoryRoot, fixture.baseRevision);
    await seedWaitingJournal(fixture.application, fixture.repositoryRoot, fixture.baseRevision);

    const assessment = unwrap(
      await fixture.application.assessWorktreeProvisionRecovery.execute(recoveryLocator()),
    );
    expect(assessment).toMatchObject({
      schemaVersion: WORKTREE_PROVISION_RECOVERY_SCHEMA_VERSION,
      status: WorktreeProvisionRecoveryInspectionStatus.Applied,
      journalStatus: ActionJournalStatus.WaitingHuman,
    });
    expect(JSON.stringify(assessment)).not.toContain(fixture.repositoryRoot);

    const command = reconcileCommand(assessment.digest);
    const first = await fixture.application.worktreeProvisionRecoveryCommands.execute(command);
    expect(first).toMatchObject({
      status: ResultStatus.Success,
      value: { status: CommandStatus.Committed, committedVersion: 1 },
    });
    expect(await loadJournal(fixture.application)).toMatchObject({
      status: ActionJournalStatus.Recovered,
    });

    const restarted = createApplication(fixture.storeRoot, fixture.repositoryRoot);
    expect(await restarted.worktreeProvisionRecoveryCommands.execute(command)).toEqual(first);
  });

  it("路径、Registry 与分支均不存在时只允许后续受控重试", async () => {
    const fixture = await setupFixture("not-applied");
    await seedWaitingJournal(fixture.application, fixture.repositoryRoot, fixture.baseRevision);
    const assessment = unwrap(
      await fixture.application.assessWorktreeProvisionRecovery.execute(recoveryLocator()),
    );
    expect(assessment.status).toBe(WorktreeProvisionRecoveryInspectionStatus.NotApplied);

    const result = await fixture.application.worktreeProvisionRecoveryCommands.execute(
      reconcileCommand(assessment.digest),
    );
    expect(result).toMatchObject({ value: { status: CommandStatus.Committed } });
    expect(await loadJournal(fixture.application)).toMatchObject({
      status: ActionJournalStatus.RetryPermitted,
    });
  });

  it("脏 Worktree 不被自动接纳并继续等待 Human", async () => {
    const fixture = await setupFixture("dirty");
    await createManagedWorktree(fixture.repositoryRoot, fixture.baseRevision);
    await writeFile(
      join(fixture.repositoryRoot, "worktrees", "task", "src", "index.ts"),
      "export const value = 2;\n",
    );
    await seedWaitingJournal(fixture.application, fixture.repositoryRoot, fixture.baseRevision);
    const assessment = unwrap(
      await fixture.application.assessWorktreeProvisionRecovery.execute(recoveryLocator()),
    );
    expect(assessment.status).toBe(WorktreeProvisionRecoveryInspectionStatus.HumanRequired);

    const result = await fixture.application.worktreeProvisionRecoveryCommands.execute(
      reconcileCommand(assessment.digest),
    );
    expect(result).toMatchObject({ value: { status: CommandStatus.Committed } });
    const journal = await loadJournal(fixture.application);
    expect(journal.status).toBe(ActionJournalStatus.WaitingHuman);
    expect(journal.observations.at(-1)?.outcome).toBe(ActionOutcome.OutcomeUnknown);
  });

  it("Human 确认后现场发生漂移时拒绝写入 Journal", async () => {
    const fixture = await setupFixture("drift");
    await seedWaitingJournal(fixture.application, fixture.repositoryRoot, fixture.baseRevision);
    const assessment = unwrap(
      await fixture.application.assessWorktreeProvisionRecovery.execute(recoveryLocator()),
    );
    await createManagedWorktree(fixture.repositoryRoot, fixture.baseRevision);

    const result = await fixture.application.worktreeProvisionRecoveryCommands.execute(
      reconcileCommand(assessment.digest),
    );
    expect(result).toMatchObject({ value: { status: CommandStatus.Conflict } });
    expect(await loadJournal(fixture.application)).toMatchObject({
      status: ActionJournalStatus.WaitingHuman,
      lastSequence: 3,
    });
  });

  it("拒绝 Agent 代替 Human 对账且不追加 Journal", async () => {
    const fixture = await setupFixture("agent-rejected");
    await seedWaitingJournal(fixture.application, fixture.repositoryRoot, fixture.baseRevision);
    const assessment = unwrap(
      await fixture.application.assessWorktreeProvisionRecovery.execute(recoveryLocator()),
    );
    const command = reconcileCommand(assessment.digest, ActorKind.Agent);

    const result = await fixture.application.worktreeProvisionRecoveryCommands.execute(command);
    expect(result).toMatchObject({ value: { status: CommandStatus.Rejected } });
    expect(await loadJournal(fixture.application)).toMatchObject({
      status: ActionJournalStatus.WaitingHuman,
      lastSequence: 3,
    });
  });

  it("拒绝与当前 CodingTask Worktree 绑定不一致的原 Action", async () => {
    const fixture = await setupFixture("wrong-target");
    await seedWaitingJournal(
      fixture.application,
      fixture.repositoryRoot,
      fixture.baseRevision,
      "feature/other",
    );

    const assessment =
      await fixture.application.assessWorktreeProvisionRecovery.execute(recoveryLocator());
    expect(assessment.status).toBe(ResultStatus.Failure);
    expect(await loadJournal(fixture.application)).toMatchObject({
      status: ActionJournalStatus.WaitingHuman,
      lastSequence: 3,
    });
  });

  it("补全 AwaitingResolution 的既有成功 Observation，不重复写入恢复 Observation", async () => {
    const fixture = await setupFixture("awaiting-resolution");
    await createManagedWorktree(fixture.repositoryRoot, fixture.baseRevision);
    await seedAwaitingJournal(fixture.application, fixture.repositoryRoot, fixture.baseRevision);
    const assessment = unwrap(
      await fixture.application.assessWorktreeProvisionRecovery.execute(recoveryLocator()),
    );

    const result = await fixture.application.worktreeProvisionRecoveryCommands.execute(
      reconcileCommand(assessment.digest),
    );
    expect(result).toMatchObject({ value: { status: CommandStatus.Committed } });
    expect(await loadJournal(fixture.application)).toMatchObject({
      status: ActionJournalStatus.Recovered,
      lastSequence: 3,
      observations: [expect.objectContaining({ outcome: ActionOutcome.Succeeded })],
    });
  });

  it("既有 NotApplied Observation 与当前 Applied 现场冲突时以新评估闭合", async () => {
    const fixture = await setupFixture("awaiting-not-applied");
    await createManagedWorktree(fixture.repositoryRoot, fixture.baseRevision);
    await seedAwaitingJournal(
      fixture.application,
      fixture.repositoryRoot,
      fixture.baseRevision,
      ActionOutcome.NotApplied,
    );
    const assessment = unwrap(
      await fixture.application.assessWorktreeProvisionRecovery.execute(recoveryLocator()),
    );
    expect(assessment.status).toBe(WorktreeProvisionRecoveryInspectionStatus.Applied);

    const result = await fixture.application.worktreeProvisionRecoveryCommands.execute(
      reconcileCommand(assessment.digest),
    );
    expect(result).toMatchObject({ value: { status: CommandStatus.Committed } });
    expect(await loadJournal(fixture.application)).toMatchObject({
      status: ActionJournalStatus.Recovered,
      lastSequence: 5,
      observations: [
        expect.objectContaining({ outcome: ActionOutcome.NotApplied }),
        expect.objectContaining({ outcome: ActionOutcome.Succeeded }),
      ],
    });
  });
});

async function setupFixture(name: string) {
  const repository = await createRepository(name);
  const storeRoot = await runtimeStores.create(`liushi-worktree-recovery-${name}-`);
  const application = createApplication(storeRoot, repository.repositoryRoot);
  await createSourceTask(application);
  await createCodingTask(application, repository.baseRevision);
  return { ...repository, storeRoot, application };
}

function createApplication(storeRoot: string, repositoryRoot: string) {
  return createHarnessApplication({
    storeRoot,
    taskIdGenerator: { next: () => sourceTaskId },
    codingTaskAuthorizationResolver: {
      resolve: ({ requested }) =>
        Promise.resolve({ status: ResultStatus.Success, value: requested }),
    },
    repositoryRootResolver: new StaticRepositoryRootResolverAdapter([
      { workspaceId, repositoryId, repositoryRoot },
    ]),
  });
}

async function createSourceTask(application: ReturnType<typeof createApplication>): Promise<void> {
  const result = await application.createTask.execute({
    workspaceId,
    source: "worktree-provision-recovery-integration",
    actor: { kind: ActorKind.Human, actorId: "human" },
  });
  expect(result.status).toBe(ResultStatus.Success);
}

async function createCodingTask(
  application: ReturnType<typeof createApplication>,
  baseRevision: string,
): Promise<void> {
  const payload = {
    workspaceId,
    sourceTaskId,
    repositoryId,
    baseRevision,
    worktreeBinding: {
      worktreeId: "worktree-1",
      relativePath: "worktrees/task",
      branchName: "feature/worktree-recovery",
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
  const result = await application.codingTaskCommands.execute({
    schemaVersion: "1.0.0",
    commandId: "create-worktree-recovery-task",
    commandType: CodingTaskCommandType.Create,
    aggregateType: "coding_task",
    aggregateId: codingTaskId,
    expectedVersion: 0,
    idempotencyKey: "create-worktree-recovery-task",
    requestDigest: unwrap(digest.calculate(payload)),
    actor: { kind: ActorKind.Human, actorId: "human" },
    authorizationContext: {},
    correlationId: "worktree-recovery-correlation",
    submittedAt,
    payload,
  });
  expect(result).toMatchObject({ value: { status: CommandStatus.Committed } });
}

async function seedWaitingJournal(
  application: ReturnType<typeof createApplication>,
  repositoryRoot: string,
  baseRevision: string,
  targetBranchName = "feature/worktree-recovery",
): Promise<void> {
  await seedIntent(application, repositoryRoot, baseRevision, targetBranchName);
  expect(
    await application.recordActionObservation.execute({
      record: {
        schemaVersion: ACTION_JOURNAL_SCHEMA_VERSION,
        recordType: ActionJournalRecordType.Observation,
        actionId,
        workspaceId,
        taskId: sourceTaskId,
        sequence: 2,
        outcome: ActionOutcome.OutcomeUnknown,
        evidenceIds: ["provision:unknown"],
        errorCode: "provision_outcome_unknown",
        actor: { kind: ActorKind.System, actorId: "test" },
        recordedAt: submittedAt,
      },
    }),
  ).toMatchObject({ status: ResultStatus.Success });
  expect(
    await application.recordActionResolution.execute({
      record: {
        schemaVersion: ACTION_JOURNAL_SCHEMA_VERSION,
        recordType: ActionJournalRecordType.Resolution,
        actionId,
        workspaceId,
        taskId: sourceTaskId,
        sequence: 3,
        resolution: ActionResolution.HumanRequired,
        reason: "测试构造未知 Provision。",
        actor: { kind: ActorKind.System, actorId: "test" },
        recordedAt: submittedAt,
      },
    }),
  ).toMatchObject({ status: ResultStatus.Success });
}

async function seedAwaitingJournal(
  application: ReturnType<typeof createApplication>,
  repositoryRoot: string,
  baseRevision: string,
  outcome = ActionOutcome.Succeeded,
): Promise<void> {
  await seedIntent(application, repositoryRoot, baseRevision);
  expect(
    await application.recordActionObservation.execute({
      record: {
        schemaVersion: ACTION_JOURNAL_SCHEMA_VERSION,
        recordType: ActionJournalRecordType.Observation,
        actionId,
        workspaceId,
        taskId: sourceTaskId,
        sequence: 2,
        outcome,
        evidenceIds: [`provision:${outcome}`],
        actor: { kind: ActorKind.System, actorId: "test" },
        recordedAt: submittedAt,
      },
    }),
  ).toMatchObject({ status: ResultStatus.Success });
}

async function seedIntent(
  application: ReturnType<typeof createApplication>,
  repositoryRoot: string,
  baseRevision: string,
  targetBranchName = "feature/worktree-recovery",
): Promise<void> {
  const repositoryRootDigest = unwrap(digest.calculate({ repositoryRoot }));
  const payload = { workspaceId, actionId, repositoryRootDigest };
  const postconditionDigest = unwrap(
    digest.calculate({
      repositoryId,
      worktreeBinding: {
        worktreeId: "worktree-1",
        relativePath: "worktrees/task",
        branchName: targetBranchName,
        managed: true,
      },
      baseRevision,
    }),
  );
  const result = await application.recordActionIntent.execute({
    record: {
      schemaVersion: ACTION_JOURNAL_SCHEMA_VERSION,
      recordType: ActionJournalRecordType.Intent,
      actionId,
      sequence: 1,
      workspaceId,
      taskId: sourceTaskId,
      commandId: "provision-worktree-unknown",
      correlationId: "worktree-recovery-correlation",
      idempotencyKey: "provision-worktree-unknown",
      kind: ActionKind.GitMutation,
      target: JSON.stringify({
        repositoryId,
        worktreeId: "worktree-1",
        relativePath: "worktrees/task",
        branchName: "feature/worktree-recovery",
      }),
      inputDigest: unwrap(digest.calculate(payload)),
      postconditionDigest,
      baseRevision,
      recoveryGuidance: "由 Human 检查 Worktree Provision 现场。",
      actor: { kind: ActorKind.Agent, actorId: "agent" },
      recordedAt: submittedAt,
    },
  });
  expect(result).toMatchObject({ status: ResultStatus.Success });
}

function reconcileCommand(expectedAssessmentDigest: string, actorKind = ActorKind.Human) {
  const payload = { workspaceId, actionId, expectedAssessmentDigest };
  return {
    schemaVersion: "1.0.0",
    commandId: `reconcile-worktree-${actorKind}`,
    commandType: WORKTREE_PROVISION_RECONCILE_COMMAND_TYPE,
    aggregateType: "coding_task",
    aggregateId: codingTaskId,
    expectedVersion: 1,
    idempotencyKey: `reconcile-worktree-${actorKind}`,
    requestDigest: unwrap(digest.calculate(payload)),
    actor: { kind: actorKind, actorId: actorKind === ActorKind.Human ? "human" : "agent" },
    authorizationContext: {},
    correlationId: "worktree-recovery-correlation",
    submittedAt,
    payload,
  };
}

function recoveryLocator() {
  return { workspaceId, codingTaskId, actionId };
}

async function loadJournal(application: ReturnType<typeof createApplication>) {
  return unwrap(
    await application.getActionJournal.execute({ workspaceId, taskId: sourceTaskId, actionId }),
  );
}

async function createRepository(name: string) {
  const repositoryRoot = await mkdtemp(join(tmpdir(), `liushi-worktree-recovery-${name}-`));
  repositories.push(repositoryRoot);
  await runGit(repositoryRoot, ["init", "-b", "main"]);
  await mkdir(join(repositoryRoot, "src"));
  await writeFile(join(repositoryRoot, "src", "index.ts"), "export const value = 1;\n");
  await runGit(repositoryRoot, ["add", "."]);
  await runGit(repositoryRoot, [
    "-c",
    "user.name=liushi-test",
    "-c",
    "user.email=liushi-test@example.com",
    "commit",
    "-m",
    "base",
  ]);
  return { repositoryRoot, baseRevision: await runGit(repositoryRoot, ["rev-parse", "HEAD"]) };
}

async function createManagedWorktree(repositoryRoot: string, baseRevision: string): Promise<void> {
  await mkdir(join(repositoryRoot, "worktrees"), { recursive: true });
  await runGit(repositoryRoot, [
    "worktree",
    "add",
    "-b",
    "feature/worktree-recovery",
    "--",
    join(repositoryRoot, "worktrees", "task"),
    baseRevision,
  ]);
}

async function runGit(cwd: string, args: readonly string[]): Promise<string> {
  const result = await new NodeCommandRunnerAdapter().run({
    executable: "git",
    args,
    cwd,
    timeoutMs: 10_000,
  });
  if (result.status === ResultStatus.Failure) throw result.error;
  if (result.value.exitCode !== 0) throw new Error(`Git command failed: ${args[0] ?? "unknown"}`);
  return result.value.stdout.trim();
}

function unwrap<T>(result: { status: ResultStatus; value?: T; error?: Error }): T {
  if (result.status !== ResultStatus.Success || result.value === undefined) {
    throw new Error(result.error?.message ?? "测试结果解析失败。");
  }
  return result.value;
}
