import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import {
  ActionJournalStatus,
  ActorKind,
  CodingTaskAttemptOutcome,
  CodingTaskCommandHandler,
  CodingTaskCommandType,
  CodingTaskEventType,
  CodingTaskPhase,
  CommandErrorCode,
  CommandStatus,
  FailureTaxonomy,
  IMPLEMENTATION_SUBMIT_COMMAND_TYPE,
  ImplementationSubmissionHandler,
  ImplementationSubmissionService,
  JournaledActionRunner,
  UnresolvedWorktreeProvisionGuard,
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  createHarnessApplication,
  failure,
  parseCodingTaskId,
  parseWorkspaceId,
  type CodingTaskExecutionAuthorizationResolver,
  type CodingTaskRepository,
} from "../../src/index.js";
import {
  ExclusiveFileLockManager,
  FileActionExecutionLockAdapter,
  FileActionJournalRepository,
  FileCodingTaskRepository,
  FileParentDirectoryDurability,
  NodeGitCheckpointAdapter,
  NodeCommandRunnerAdapter,
  NodeRepositoryLockAdapter,
  NodeWorktreeInspectorAdapter,
  Rfc8785Sha256DigestAdapter,
  StaticRepositoryRootResolverAdapter,
  SystemClock,
  UlidGenerator,
  resolveCodingTaskStorePaths,
} from "../../src/infrastructure/index.js";
import { TemporaryRuntimeStore } from "../support/runtime/index.js";

const stores = new TemporaryRuntimeStore();
const repositories: string[] = [];
const digest = new Rfc8785Sha256DigestAdapter();
const workspaceId = "implementation-submission-workspace";
const codingTaskId = "implementation-submission-task";
const sourceTaskId = "01ARZ3NDEKTSV4RRFFQ69G5FB2";
const actionId = "01ARZ3NDEKTSV4RRFFQ69G5FC3";

afterEach(async () => {
  await stores.cleanup();
  await Promise.all(
    repositories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("实现提交 Git Checkpoint 闭环", () => {
  it("创建单一提交并原子收口当前 Attempt 到 Verification，重试不重复提交或事件", async () => {
    const setup = await createSetup("liushi-implementation-submission-success-");
    await writeFile(join(setup.worktreeRoot, "src", "index.ts"), "export const value = 2;\n");
    const command = submissionCommand(setup);

    const first = await setup.application.implementationSubmissions.execute(
      command,
      runtime(setup),
    );
    const duplicate = await createApplication(
      setup.storeRoot,
      setup.repositoryRoot,
    ).implementationSubmissions.execute(command, runtime(setup));
    const recovered = await setup.application.implementationSubmissions.execute(
      submissionCommand(setup, {
        expectedVersion: 3,
        commandId: "implementation-submission-recovery",
        actionId: "01ARZ3NDEKTSV4RRFFQ69G5FC4",
      }),
      runtime(setup),
    );
    const aggregate = await loadAggregate(setup);

    expect(first).toMatchObject({
      status: ResultStatus.Success,
      value: { status: CommandStatus.Committed, committedVersion: 3 },
    });
    expect(duplicate).toEqual(first);
    expect(recovered).toMatchObject({
      status: ResultStatus.Success,
      value: { status: CommandStatus.Committed, committedVersion: 3 },
    });
    expect(await commitCount(setup)).toBe("1");
    expect(await implementationSubmittedEventCount(setup)).toBe(1);
    expect(aggregate).toMatchObject({
      phase: CodingTaskPhase.Verification,
      version: 3,
      attempts: [
        {
          number: 1,
          outcome: CodingTaskAttemptOutcome.Succeeded,
          changedPaths: ["src/index.ts"],
        },
      ],
    });
    expect(aggregate.attempts[0]?.finishedAt).toBeDefined();
    expect(aggregate.attempts[0]?.targetRevision).toBe(
      await runGit(setup.worktreeRoot, ["rev-parse", "HEAD"]),
    );
  });

  it("Write Set 越界时等待 Human，且不创建提交或领域事件", async () => {
    const setup = await createSetup("liushi-implementation-submission-write-set-");
    await writeFile(join(setup.worktreeRoot, "outside.ts"), "outside\n");

    const result = await setup.application.implementationSubmissions.execute(
      submissionCommand(setup),
      runtime(setup),
    );

    expect(result).toMatchObject({
      status: ResultStatus.Success,
      value: { status: CommandStatus.OutcomeUnknown },
    });
    expect(await actionJournal(setup)).toMatchObject({
      status: ResultStatus.Success,
      value: { status: ActionJournalStatus.WaitingHuman },
    });
    expect(await commitCount(setup)).toBe("0");
    expect(await implementationSubmittedEventCount(setup)).toBe(0);
    const aggregate = await loadAggregate(setup);
    expect(aggregate).toMatchObject({
      phase: CodingTaskPhase.Implementation,
      version: 2,
      attempts: [{ number: 1 }],
    });
    expect(aggregate.attempts[0]).not.toHaveProperty("finishedAt");
  });

  it("确定性前置条件未满足时固化 Receipt，修复后使用新命令与 Action 重试", async () => {
    const setup = await createSetup("liushi-implementation-submission-retry-");
    const command = submissionCommand(setup);

    const first = await setup.application.implementationSubmissions.execute(
      command,
      runtime(setup),
    );
    await writeFile(join(setup.worktreeRoot, "src", "index.ts"), "export const value = 2;\n");
    const retried = await setup.application.implementationSubmissions.execute(
      submissionCommand(setup, {
        commandId: "implementation-submission-retry",
        actionId: "01ARZ3NDEKTSV4RRFFQ69G5FC5",
      }),
      runtime(setup),
    );

    expect(first).toMatchObject({
      status: ResultStatus.Success,
      value: {
        status: CommandStatus.Rejected,
        errorCode: CommandErrorCode.PreconditionNotMet,
      },
    });
    expect(retried).toMatchObject({
      status: ResultStatus.Success,
      value: { status: CommandStatus.Committed, committedVersion: 3 },
    });
    expect(await actionJournal(setup)).toMatchObject({
      status: ResultStatus.Success,
      value: { status: ActionJournalStatus.RetryPermitted },
    });
    expect(await actionJournal(setup, "01ARZ3NDEKTSV4RRFFQ69G5FC5")).toMatchObject({
      status: ResultStatus.Success,
      value: { status: ActionJournalStatus.Committed },
    });
    expect(await commitCount(setup)).toBe("1");
    expect(await implementationSubmittedEventCount(setup)).toBe(1);
  });

  it("Git 已提交但 Event 闭合未知时，仅允许 Human 用新命令接纳既有 Checkpoint", async () => {
    const setup = await createSetup("liushi-implementation-submission-event-unknown-");
    await writeFile(join(setup.worktreeRoot, "src", "index.ts"), "export const value = 2;\n");
    const repository = createCodingTaskRepository(setup.storeRoot);
    let failImplementationAppend = true;
    const faultingRepository: CodingTaskRepository = {
      load: (locator) => repository.load(locator),
      append: (input) => {
        if (
          failImplementationAppend &&
          input.event.type === CodingTaskEventType.ImplementationSubmitted
        ) {
          failImplementationAppend = false;
          return Promise.resolve(
            failure(
              new HarnessError(
                HarnessErrorCode.EventLogCommitOutcomeUnknown,
                "测试注入：ImplementationSubmitted 提交结果未知。",
              ),
            ),
          );
        }
        return repository.append(input);
      },
    };

    const first = await createSubmissionService(setup, faultingRepository).execute(
      submissionCommand(setup),
      runtime(setup),
    );
    const recovered = await createSubmissionService(setup, repository).execute(
      submissionCommand(setup, {
        commandId: "implementation-submission-human-recovery",
        actorKind: ActorKind.Human,
      }),
      runtime(setup),
    );

    expect(first).toMatchObject({
      status: ResultStatus.Success,
      value: { status: CommandStatus.OutcomeUnknown },
    });
    expect(recovered).toMatchObject({
      status: ResultStatus.Success,
      value: { status: CommandStatus.Committed, committedVersion: 3 },
    });
    expect(await commitCount(setup)).toBe("1");
    expect(await implementationSubmittedEventCount(setup)).toBe(1);
  });

  it("错误 expectedVersion 在 Git 副作用前冲突失败", async () => {
    const setup = await createSetup("liushi-implementation-submission-version-");
    await writeFile(join(setup.worktreeRoot, "src", "index.ts"), "export const value = 2;\n");

    const result = await setup.application.implementationSubmissions.execute(
      submissionCommand(setup, { expectedVersion: 1 }),
      runtime(setup),
    );

    expect(result).toMatchObject({
      status: ResultStatus.Success,
      value: { status: CommandStatus.Conflict },
    });
    expect((await actionJournal(setup)).status).toBe(ResultStatus.Failure);
    expect(await commitCount(setup)).toBe("0");
    expect(await implementationSubmittedEventCount(setup)).toBe(0);
  });

  it("Runtime Root 与可信 Repository 绑定不一致时在 Git 副作用前拒绝", async () => {
    const setup = await createSetup("liushi-implementation-submission-root-binding-");
    const unrelatedRoot = await mkdtemp(join(tmpdir(), "liushi-unrelated-repository-"));
    repositories.push(unrelatedRoot);
    await writeFile(join(setup.worktreeRoot, "src", "index.ts"), "export const value = 2;\n");
    const application = createApplication(setup.storeRoot, unrelatedRoot);

    const result = await application.implementationSubmissions.execute(
      submissionCommand(setup),
      runtime(setup),
    );

    expect(result).toMatchObject({
      status: ResultStatus.Success,
      value: { status: CommandStatus.Rejected },
    });
    expect(await commitCount(setup)).toBe("0");
    expect(await implementationSubmittedEventCount(setup)).toBe(0);
  });

  it("已结束的 Attempt 在 Git 副作用前拒绝提交", async () => {
    const setup = await createSetup("liushi-implementation-submission-finished-");
    await setup.application.codingTaskCommands.execute(
      codingCommand(CodingTaskCommandType.FinishAttempt, "finish-attempt", 2, {
        workspaceId,
        attemptNumber: 1,
        outcome: CodingTaskAttemptOutcome.Failed,
        failureTaxonomy: FailureTaxonomy.ImplementationDefect,
      }),
    );
    await writeFile(join(setup.worktreeRoot, "src", "index.ts"), "export const value = 2;\n");

    const result = await setup.application.implementationSubmissions.execute(
      submissionCommand(setup, { expectedVersion: 3 }),
      runtime(setup),
    );

    expect(result).toMatchObject({
      status: ResultStatus.Success,
      value: { status: CommandStatus.Rejected },
    });
    expect((await actionJournal(setup)).status).toBe(ResultStatus.Failure);
    expect(await commitCount(setup)).toBe("0");
    expect(await implementationSubmittedEventCount(setup)).toBe(0);
  });

  it("Git 执行结果未知时等待 Human，不猜测提交成功", async () => {
    const setup = await createSetup("liushi-implementation-submission-unknown-");
    await writeFile(join(setup.worktreeRoot, "src", "index.ts"), "export const value = 2;\n");
    const gitIndex = await runGit(setup.worktreeRoot, ["rev-parse", "--git-path", "index"]);
    await writeFile(
      `${isAbsolute(gitIndex) ? gitIndex : resolve(setup.worktreeRoot, gitIndex)}.lock`,
      "locked\n",
    );

    const result = await setup.application.implementationSubmissions.execute(
      submissionCommand(setup),
      runtime(setup),
    );

    expect(result).toMatchObject({
      status: ResultStatus.Success,
      value: { status: CommandStatus.OutcomeUnknown },
    });
    expect(await actionJournal(setup)).toMatchObject({
      status: ResultStatus.Success,
      value: { status: ActionJournalStatus.WaitingHuman },
    });
    expect(await commitCount(setup)).toBe("0");
    expect(await implementationSubmittedEventCount(setup)).toBe(0);
  });
});

/** 真实 Git 仓库、Managed Worktree 与持久化 Store 组成的测试环境。 */
interface Setup {
  readonly storeRoot: string;
  readonly repositoryRoot: string;
  readonly worktreeRoot: string;
  readonly baseRevision: string;
  readonly application: ReturnType<typeof createApplication>;
}

/** 创建已进入 Implementation 且 Attempt 仍在运行的 CodingTask。 */
async function createSetup(prefix: string): Promise<Setup> {
  const storeRoot = await stores.create(prefix);
  const repositoryRoot = await mkdtemp(join(tmpdir(), "liushi-implementation-submission-repo-"));
  repositories.push(repositoryRoot);
  await runGit(repositoryRoot, ["init", "-b", "main"]);
  await runGit(repositoryRoot, ["config", "user.name", "liushi-test"]);
  await runGit(repositoryRoot, ["config", "user.email", "liushi-test@example.com"]);
  await mkdir(join(repositoryRoot, "src"));
  await writeFile(join(repositoryRoot, "src", "index.ts"), "export const value = 1;\n");
  await runGit(repositoryRoot, ["add", "."]);
  await runGit(repositoryRoot, ["commit", "-m", "base"]);
  const baseRevision = await runGit(repositoryRoot, ["rev-parse", "HEAD"]);
  const worktreeRoot = join(repositoryRoot, "worktrees", "task");
  await runGit(repositoryRoot, [
    "worktree",
    "add",
    "-b",
    "feature/implementation-submission",
    worktreeRoot,
    baseRevision,
  ]);
  const application = createApplication(storeRoot, repositoryRoot);
  await application.createTask.execute({
    workspaceId,
    source: "implementation-submission-test",
    actor: { kind: ActorKind.Human, actorId: "human" },
  });
  await application.codingTaskCommands.execute(
    codingCommand(CodingTaskCommandType.Create, "create-coding-task", 0, {
      workspaceId,
      sourceTaskId,
      repositoryId: "repo-1",
      baseRevision,
      worktreeBinding: {
        worktreeId: "worktree-1",
        relativePath: "worktrees/task",
        branchName: "feature/implementation-submission",
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
    codingCommand(CodingTaskCommandType.StartAttempt, "start-attempt", 1, {
      workspaceId,
      attemptNumber: 1,
    }),
  );
  return { storeRoot, repositoryRoot, worktreeRoot, baseRevision, application };
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
      { workspaceId, repositoryId: "repo-1", repositoryRoot },
    ]),
  });
}

function createCodingTaskRepository(storeRoot: string): FileCodingTaskRepository {
  return new FileCodingTaskRepository(storeRoot, {
    lockManager: new ExclusiveFileLockManager(),
    parentDirectoryDurability: new FileParentDirectoryDurability(),
  });
}

function createSubmissionService(
  setup: Setup,
  repository: CodingTaskRepository,
): ImplementationSubmissionService {
  const lockManager = new ExclusiveFileLockManager();
  const durability = new FileParentDirectoryDurability();
  const clock = new SystemClock();
  const idGenerator = new UlidGenerator();
  const authorizationResolver: CodingTaskExecutionAuthorizationResolver = {
    resolve: ({ requested }) => Promise.resolve({ status: ResultStatus.Success, value: requested }),
  };
  const commandRunner = new NodeCommandRunnerAdapter();
  const worktreeInspector = new NodeWorktreeInspectorAdapter(commandRunner);
  const codingTaskHandler = new CodingTaskCommandHandler(
    repository,
    clock,
    idGenerator,
    authorizationResolver,
  );
  const actionJournalRepository = new FileActionJournalRepository(setup.storeRoot, {
    lockManager,
    parentDirectoryDurability: durability,
  });
  const handler = new ImplementationSubmissionHandler(
    repository,
    authorizationResolver,
    new StaticRepositoryRootResolverAdapter([
      { workspaceId, repositoryId: "repo-1", repositoryRoot: setup.repositoryRoot },
    ]),
    new NodeRepositoryLockAdapter(setup.storeRoot, lockManager, clock, idGenerator),
    new JournaledActionRunner(
      actionJournalRepository,
      clock,
      new FileActionExecutionLockAdapter(setup.storeRoot, lockManager),
    ),
    new NodeGitCheckpointAdapter(commandRunner, worktreeInspector, digest),
    codingTaskHandler,
    digest,
    new UnresolvedWorktreeProvisionGuard(actionJournalRepository, digest),
  );
  return new ImplementationSubmissionService(setup.application.applicationCommandGateway, handler);
}

function submissionCommand(
  setup: Setup,
  overrides: {
    expectedVersion?: number;
    commandId?: string;
    actionId?: string;
    actorKind?: ActorKind;
  } = {},
) {
  const payload = {
    workspaceId,
    actionId: overrides.actionId ?? actionId,
    attemptNumber: 1,
    repositoryRootDigest: unwrap(digest.calculate(runtime(setup))),
  };
  return {
    schemaVersion: "1.0.0",
    commandId: overrides.commandId ?? "implementation-submission-1",
    commandType: IMPLEMENTATION_SUBMIT_COMMAND_TYPE,
    aggregateType: "coding_task",
    aggregateId: codingTaskId,
    expectedVersion: overrides.expectedVersion ?? 2,
    idempotencyKey: overrides.commandId ?? "implementation-submission-1",
    requestDigest: unwrap(digest.calculate(payload)),
    actor: {
      kind: overrides.actorKind ?? ActorKind.Agent,
      actorId: overrides.actorKind === ActorKind.Human ? "human" : "agent",
    },
    authorizationContext: {},
    correlationId: "implementation-submission-correlation",
    submittedAt: "2026-07-13T00:00:00.000Z",
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
    correlationId: "implementation-submission-correlation",
    submittedAt: "2026-07-13T00:00:00.000Z",
    payload,
  };
}

function runtime(setup: Setup) {
  return { repositoryRoot: setup.repositoryRoot };
}

async function loadAggregate(setup: Setup) {
  const repository = new FileCodingTaskRepository(setup.storeRoot, {
    lockManager: new ExclusiveFileLockManager(),
    parentDirectoryDurability: new FileParentDirectoryDurability(),
  });
  const loaded = await repository.load({
    workspaceId: unwrap(parseWorkspaceId(workspaceId)),
    codingTaskId: unwrap(parseCodingTaskId(codingTaskId)),
  });
  return unwrap(loaded).aggregate;
}

async function implementationSubmittedEventCount(setup: Setup): Promise<number> {
  const paths = resolveCodingTaskStorePaths(
    setup.storeRoot,
    unwrap(parseWorkspaceId(workspaceId)),
    unwrap(parseCodingTaskId(codingTaskId)),
  );
  const events = (await readFile(paths.eventsFile, "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as { type: CodingTaskEventType });
  return events.filter((event) => event.type === CodingTaskEventType.ImplementationSubmitted)
    .length;
}

function actionJournal(setup: Setup, targetActionId = actionId) {
  return setup.application.getActionJournal.execute({
    workspaceId,
    taskId: sourceTaskId,
    actionId: targetActionId,
  });
}

function commitCount(setup: Setup): Promise<string> {
  return runGit(setup.worktreeRoot, ["rev-list", "--count", `${setup.baseRevision}..HEAD`]);
}

async function runGit(cwd: string, args: readonly string[]): Promise<string> {
  const result = await new NodeCommandRunnerAdapter().run({
    executable: "git",
    args,
    cwd,
    timeoutMs: 10_000,
  });
  if (result.status === ResultStatus.Failure || result.value.exitCode !== 0) {
    throw new Error("Git 测试命令失败。");
  }
  return result.value.stdout.trim();
}

function unwrap<T>(result: { status: ResultStatus; value?: T; error?: Error }): T {
  if (result.status !== ResultStatus.Success || result.value === undefined) {
    throw new Error(result.error?.message ?? "测试值解析失败。");
  }
  return result.value;
}
