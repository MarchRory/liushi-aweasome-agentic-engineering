import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ActionJournalStatus,
  ActorKind,
  CodingTaskAttemptOutcome,
  CodingTaskCommandHandler,
  CodingTaskCommandType,
  CommandErrorCode,
  CommandStatus,
  FailureTaxonomy,
  ResultStatus,
  VERIFICATION_RUN_COMMAND_TYPE,
  VerificationExecutionMode,
  VerificationKind,
  VerificationRequirement,
  VerificationStatus,
  createHarnessApplication,
  parseCodingTaskId,
  parseWorkspaceId,
  type CodingTaskCommandPayload,
  type CommandEnvelope,
  type VerificationExecutorPort,
} from "../../src/index.js";
import { codingTaskImplementationSubmissionCapability } from "../../src/application/codingTask/internal/index.js";
import {
  ExclusiveFileLockManager,
  FileCodingTaskRepository,
  FileParentDirectoryDurability,
  NodeCommandRunnerAdapter,
  Rfc8785Sha256DigestAdapter,
} from "../../src/infrastructure/index.js";
import {
  FixedClock,
  FixedSequenceIdGenerator,
  TemporaryRuntimeStore,
} from "../support/runtime/index.js";

const runtimeStores = new TemporaryRuntimeStore();
const repositories: string[] = [];
const workspaceId = "verification-command-workspace";
const codingTaskId = "verification-command-task";
const sourceTaskId = "01ARZ3NDEKTSV4RRFFQ69G5FB2";
const actionId = "01ARZ3NDEKTSV4RRFFQ69G5FC2";
const submittedAt = "2026-07-12T00:00:00.000Z";
const digest = new Rfc8785Sha256DigestAdapter();

afterEach(async () => {
  await runtimeStores.cleanup();
  await Promise.all(
    repositories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("Verification Command 纵向闭环", () => {
  it("运行真实 Check、提交 Evidence/Journal、完成 CodingTask 并跨实例复用 Receipt", async () => {
    const setup = await createSetup("liushi-verification-command-pass-");
    const command = verificationCommand(setup, ["-e", "process.exit(0)"]);

    const first = await setup.application.verificationCommands.execute(command, {
      worktreeRoot: setup.worktreeRoot,
    });
    const duplicate = await createApplication(setup.storeRoot).verificationCommands.execute(
      command,
      { worktreeRoot: setup.worktreeRoot },
    );
    const evidence = await setup.application.evidenceBundleStore.load({
      workspaceId: unwrap(parseWorkspaceId(workspaceId)),
      codingTaskId: unwrap(parseCodingTaskId(codingTaskId)),
      verificationRunId: "verification-run-1",
    });
    const journal = await setup.application.getActionJournal.execute({
      workspaceId,
      taskId: sourceTaskId,
      actionId,
    });
    const aggregate = await loadCodingTask(setup.storeRoot);

    expect(first).toMatchObject({
      status: ResultStatus.Success,
      value: { status: CommandStatus.Committed, committedVersion: 4 },
    });
    expect(duplicate).toEqual(first);
    expect(evidence).toMatchObject({
      status: ResultStatus.Success,
      value: { status: VerificationStatus.Passed },
    });
    expect(journal).toMatchObject({
      status: ResultStatus.Success,
      value: { status: ActionJournalStatus.Committed },
    });
    expect(aggregate).toMatchObject({ phase: "verification", runState: "completed", version: 4 });
  });

  it("明确 Check 失败按已确认分类返回 Implementation 修复", async () => {
    const setup = await createSetup("liushi-verification-command-fail-");
    const result = await setup.application.verificationCommands.execute(
      verificationCommand(setup, ["-e", "process.exit(2)"]),
      { worktreeRoot: setup.worktreeRoot },
    );
    const aggregate = await loadCodingTask(setup.storeRoot);

    expect(result).toMatchObject({
      status: ResultStatus.Success,
      value: { status: CommandStatus.Committed, committedVersion: 4 },
    });
    expect(aggregate).toMatchObject({ phase: "implementation", runState: "active", version: 4 });
  });

  it("Runtime Root Digest 不匹配时在 Reservation 和命令执行前拒绝", async () => {
    const setup = await createSetup("liushi-verification-command-binding-");
    const otherRoot = await mkdtemp(join(tmpdir(), "liushi-verification-other-"));
    repositories.push(otherRoot);

    const result = await setup.application.verificationCommands.execute(
      verificationCommand(setup, ["-e", "process.exit(0)"]),
      { worktreeRoot: otherRoot },
    );

    expect(result.status).toBe(ResultStatus.Failure);
    const evidence = await setup.application.evidenceBundleStore.load({
      workspaceId: unwrap(parseWorkspaceId(workspaceId)),
      codingTaskId: unwrap(parseCodingTaskId(codingTaskId)),
      verificationRunId: "verification-run-1",
    });
    expect(evidence.status).toBe(ResultStatus.Failure);
  });

  it.each(["错误", "陈旧"])(
    "%s targetRevision 在 Executor 和 Journal 副作用前被拒绝",
    async (revisionKind) => {
      const execute = vi.fn<VerificationExecutorPort["execute"]>();
      const setup = await createSetup(
        `liushi-verification-command-revision-${revisionKind.length}-`,
        {
          verificationExecutor: { execute },
        },
      );
      const targetRevision =
        revisionKind === "陈旧" ? setup.baseRevision : "f".repeat(setup.targetRevision.length);

      const result = await setup.application.verificationCommands.execute(
        verificationCommand(setup, ["-e", "process.exit(0)"], targetRevision),
        { worktreeRoot: setup.worktreeRoot },
      );
      const journal = await setup.application.getActionJournal.execute({
        workspaceId,
        taskId: sourceTaskId,
        actionId,
      });

      expect(result).toMatchObject({
        status: ResultStatus.Success,
        value: {
          status: CommandStatus.Rejected,
          errorCode: CommandErrorCode.InvalidPayload,
        },
      });
      expect(execute).not.toHaveBeenCalled();
      expect(journal.status).toBe(ResultStatus.Failure);
      expect((await loadCodingTask(setup.storeRoot)).version).toBe(setup.expectedVersion);
    },
  );

  it("Attempt 缺少 targetRevision 时关闭式拒绝且不产生 Executor 或 Journal 副作用", async () => {
    const execute = vi.fn<VerificationExecutorPort["execute"]>();
    const setup = await createSetup("liushi-verification-command-missing-revision-", {
      verificationExecutor: { execute },
      omitAttemptTargetRevision: true,
    });

    const result = await setup.application.verificationCommands.execute(
      verificationCommand(setup, ["-e", "process.exit(0)"], setup.baseRevision),
      { worktreeRoot: setup.worktreeRoot },
    );
    const journal = await setup.application.getActionJournal.execute({
      workspaceId,
      taskId: sourceTaskId,
      actionId,
    });

    expect(result).toMatchObject({
      status: ResultStatus.Success,
      value: {
        status: CommandStatus.Rejected,
        errorCode: CommandErrorCode.InvalidPayload,
      },
    });
    expect(execute).not.toHaveBeenCalled();
    expect(journal.status).toBe(ResultStatus.Failure);
    expect((await loadCodingTask(setup.storeRoot)).version).toBe(setup.expectedVersion);
  });
});

/** 版本化验证命令集成测试所需的真实运行环境。 */
interface Setup {
  readonly storeRoot: string;
  readonly repositoryRoot: string;
  readonly worktreeRoot: string;
  readonly baseRevision: string;
  readonly targetRevision: string;
  readonly expectedVersion: number;
  readonly application: ReturnType<typeof createApplication>;
}

/** 验证命令测试环境的可选依赖与异常状态。 */
interface SetupOptions {
  readonly verificationExecutor?: VerificationExecutorPort;
  readonly omitAttemptTargetRevision?: boolean;
}

/** 创建具备真实仓库、受管工作树和持久化存储的测试环境。 */
async function createSetup(prefix: string, options: SetupOptions = {}): Promise<Setup> {
  const storeRoot = await runtimeStores.create(prefix);
  const repositoryRoot = await mkdtemp(join(tmpdir(), "liushi-verification-command-repo-"));
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
  const baseRevision = await runGit(repositoryRoot, ["rev-parse", "HEAD"]);
  const worktreeRoot = join(repositoryRoot, "worktrees", "task");
  await runGit(repositoryRoot, [
    "worktree",
    "add",
    "-b",
    "feature/verification-command",
    worktreeRoot,
    baseRevision,
  ]);
  await writeFile(join(worktreeRoot, "src", "index.ts"), "export const value = 2;\n");
  await runGit(worktreeRoot, ["add", "src/index.ts"]);
  await runGit(worktreeRoot, [
    "-c",
    "user.name=liushi-test",
    "-c",
    "user.email=liushi-test@example.com",
    "commit",
    "-m",
    "target",
  ]);
  const targetRevision = await runGit(worktreeRoot, ["rev-parse", "HEAD"]);
  const application = createApplication(storeRoot, options.verificationExecutor);
  await application.createTask.execute({
    workspaceId,
    source: "verification-command-integration",
    actor: { kind: ActorKind.Human, actorId: "human" },
  });
  const expectedVersion = await createAndAdvanceCodingTask(
    application,
    storeRoot,
    baseRevision,
    targetRevision,
    options.omitAttemptTargetRevision ?? false,
  );
  return {
    storeRoot,
    repositoryRoot,
    worktreeRoot,
    baseRevision,
    targetRevision,
    expectedVersion,
    application,
  };
}

function createApplication(storeRoot: string, verificationExecutor?: VerificationExecutorPort) {
  return createHarnessApplication({
    storeRoot,
    taskIdGenerator: { next: () => sourceTaskId },
    verificationExecutionMode: VerificationExecutionMode.LocalCommand,
    ...(verificationExecutor === undefined ? {} : { verificationExecutor }),
    codingTaskAuthorizationResolver: {
      resolve: ({ requested }) =>
        Promise.resolve({ status: ResultStatus.Success, value: requested }),
    },
  });
}

async function createAndAdvanceCodingTask(
  application: ReturnType<typeof createApplication>,
  storeRoot: string,
  baseRevision: string,
  targetRevision: string,
  omitAttemptTargetRevision: boolean,
): Promise<number> {
  await application.codingTaskCommands.execute(
    codingCommand(CodingTaskCommandType.Create, "verification-create", 0, {
      workspaceId,
      sourceTaskId,
      repositoryId: "repo-1",
      baseRevision,
      worktreeBinding: {
        worktreeId: "worktree-1",
        relativePath: "worktrees/task",
        branchName: "feature/verification-command",
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
    }),
  );
  await application.codingTaskCommands.execute(
    codingCommand(CodingTaskCommandType.StartAttempt, "verification-start", 1, {
      workspaceId,
      attemptNumber: 1,
    }),
  );
  if (!omitAttemptTargetRevision) {
    const repository = new FileCodingTaskRepository(storeRoot, {
      lockManager: new ExclusiveFileLockManager(),
      parentDirectoryDurability: new FileParentDirectoryDurability(),
    });
    const handler = new CodingTaskCommandHandler(
      repository,
      new FixedClock(submittedAt),
      new FixedSequenceIdGenerator(["01ARZ3NDEKTSV4RRFFQ69G5FC5"]),
      {
        resolve: ({ requested }) =>
          Promise.resolve({ status: ResultStatus.Success, value: requested }),
      },
    );
    const submitted = await handler.executeImplementationSubmission(
      codingCommand(CodingTaskCommandType.SubmitImplementation, "verification-submit", 2, {
        workspaceId,
        attemptNumber: 1,
        targetRevision,
        changedPaths: ["src/index.ts"],
      }) as CommandEnvelope<CodingTaskCommandPayload>,
      codingTaskImplementationSubmissionCapability,
    );
    if (submitted.status === ResultStatus.Failure) throw submitted.error;
    return 3;
  }
  await application.codingTaskCommands.execute(
    codingCommand(CodingTaskCommandType.FinishAttempt, "verification-finish", 2, {
      workspaceId,
      attemptNumber: 1,
      outcome: CodingTaskAttemptOutcome.Succeeded,
    }),
  );
  await application.codingTaskCommands.execute(
    codingCommand(CodingTaskCommandType.RequestVerification, "verification-request", 3, {
      workspaceId,
      attemptNumber: 1,
    }),
  );
  return 4;
}

function verificationCommand(
  setup: Setup,
  args: readonly string[],
  targetRevision = setup.targetRevision,
) {
  const pathKey = Object.keys(process.env).find((key) => key.toUpperCase() === "PATH");
  if (pathKey === undefined) throw new Error("测试环境缺少 PATH。");
  const payload = {
    workspaceId,
    actionId,
    verificationRunId: "verification-run-1",
    attemptNumber: 1,
    worktreeRootDigest: unwrap(digest.calculate({ worktreeRoot: setup.worktreeRoot })),
    plan: {
      schemaVersion: 1,
      planId: "verification-plan-1",
      repositoryId: "repo-1",
      worktreeId: "worktree-1",
      expectedBranchName: "feature/verification-command",
      baseRevision: setup.baseRevision,
      targetRevision,
      checks: [
        {
          checkId: "command",
          kind: VerificationKind.Custom,
          requirement: VerificationRequirement.Required,
          command: {
            executable: "node",
            args,
            workingDirectory: "",
            allowedEnvironmentKeys: [pathKey],
          },
          timeoutMs: 10_000,
          retryable: false,
        },
      ],
    },
    failedVerificationTaxonomy: FailureTaxonomy.ImplementationDefect,
  };
  return {
    schemaVersion: "1.0.0",
    commandId: "verification-run-command-1",
    commandType: VERIFICATION_RUN_COMMAND_TYPE,
    aggregateType: "coding_task",
    aggregateId: codingTaskId,
    expectedVersion: setup.expectedVersion,
    idempotencyKey: "verification-run-command-1",
    requestDigest: unwrap(digest.calculate(payload)),
    actor: { kind: ActorKind.Agent, actorId: "agent" },
    authorizationContext: {},
    correlationId: "verification-command-correlation",
    submittedAt,
    payload,
  };
}

function codingCommand(
  commandType: CodingTaskCommandType,
  commandId: string,
  expectedVersion: number,
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
    actor: { kind: ActorKind.Agent, actorId: "agent" },
    authorizationContext: {},
    correlationId: "verification-command-correlation",
    submittedAt,
    payload,
  };
}

async function loadCodingTask(storeRoot: string) {
  const repository = new FileCodingTaskRepository(storeRoot, {
    lockManager: new ExclusiveFileLockManager(),
    parentDirectoryDurability: new FileParentDirectoryDurability(),
  });
  const result = await repository.load({
    workspaceId: unwrap(parseWorkspaceId(workspaceId)),
    codingTaskId: unwrap(parseCodingTaskId(codingTaskId)),
  });
  if (result.status === ResultStatus.Failure) throw result.error;
  return result.value.aggregate;
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
    throw new Error(result.error?.message ?? "测试值解析失败。");
  }
  return result.value;
}
