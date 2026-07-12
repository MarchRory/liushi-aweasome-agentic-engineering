import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import {
  ActionJournalStatus,
  ActorKind,
  CodingTaskCommandType,
  CommandStatus,
  FileMutationKind,
  IMPLEMENTATION_APPLY_COMMAND_TYPE,
  ResultStatus,
  createHarnessApplication,
} from "../../src/index.js";
import {
  NodeCommandRunnerAdapter,
  Rfc8785Sha256DigestAdapter,
} from "../../src/infrastructure/index.js";
import { TemporaryRuntimeStore } from "../support/runtime/index.js";

const stores = new TemporaryRuntimeStore();
const repositories: string[] = [];
const digest = new Rfc8785Sha256DigestAdapter();
const workspaceId = "implementation-command-workspace";
const codingTaskId = "implementation-command-task";
const sourceTaskId = "01ARZ3NDEKTSV4RRFFQ69G5FB2";
const actionId = "01ARZ3NDEKTSV4RRFFQ69G5FC2";

afterEach(async () => {
  await stores.cleanup();
  await Promise.all(
    repositories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("受控文件写入命令", () => {
  it("在真实 Worktree 中替换和创建文件，并持久化可重放的 Journal 与 Receipt", async () => {
    const setup = await createSetup("liushi-implementation-command-success-");
    const command = implementationCommand(setup);

    const first = await setup.application.implementationCommands.execute(command, runtime(setup));
    const duplicate = await createApplication(setup.storeRoot).implementationCommands.execute(
      command,
      runtime(setup),
    );
    const journal = await setup.application.getActionJournal.execute({
      workspaceId,
      taskId: sourceTaskId,
      actionId,
    });

    expect(first).toMatchObject({
      status: ResultStatus.Success,
      value: { status: CommandStatus.Committed, committedVersion: 2 },
    });
    expect(duplicate).toEqual(first);
    expect(await readFile(join(setup.worktreeRoot, "src", "index.ts"), "utf8")).toBe(
      "export const value = 2;\n",
    );
    expect(await readFile(join(setup.worktreeRoot, "src", "new.ts"), "utf8")).toBe(
      "export const created = true;\n",
    );
    expect(journal).toMatchObject({
      status: ResultStatus.Success,
      value: { status: ActionJournalStatus.Committed },
    });
  });

  it("Replace 前置摘要漂移时不写文件，并把 Action 封闭为可安全重提", async () => {
    const setup = await createSetup("liushi-implementation-command-drift-");
    const command = implementationCommand(setup, unwrap(digest.calculate("stale content")));

    const result = await setup.application.implementationCommands.execute(command, runtime(setup));
    const journal = await setup.application.getActionJournal.execute({
      workspaceId,
      taskId: sourceTaskId,
      actionId,
    });

    expect(result).toMatchObject({
      status: ResultStatus.Success,
      value: { status: CommandStatus.Rejected },
    });
    expect(await readFile(join(setup.worktreeRoot, "src", "index.ts"), "utf8")).toBe(
      setup.initialContent,
    );
    expect(journal).toMatchObject({
      status: ResultStatus.Success,
      value: { status: ActionJournalStatus.RetryPermitted },
    });
  });

  it("Write Set 外路径在 Intent 和文件副作用前被拒绝", async () => {
    const setup = await createSetup("liushi-implementation-command-write-set-");
    const command = implementationCommand(setup);
    command.payload.mutations[1] = {
      ...command.payload.mutations[1]!,
      path: "src/outside.ts",
    };
    command.requestDigest = unwrap(digest.calculate(command.payload));

    const result = await setup.application.implementationCommands.execute(command, runtime(setup));
    const journal = await setup.application.getActionJournal.execute({
      workspaceId,
      taskId: sourceTaskId,
      actionId,
    });

    expect(result).toMatchObject({
      status: ResultStatus.Success,
      value: { status: CommandStatus.Rejected },
    });
    expect(journal.status).toBe(ResultStatus.Failure);
  });

  it("运行时路径摘要漂移时在 Gateway Reservation 前拒绝", async () => {
    const setup = await createSetup("liushi-implementation-command-runtime-");
    const result = await setup.application.implementationCommands.execute(
      implementationCommand(setup),
      { ...runtime(setup), worktreeRoot: setup.repositoryRoot },
    );
    expect(result.status).toBe(ResultStatus.Failure);
  });

  it("Intent 之后发现工作区非洁净时不猜测来源并等待 Human 恢复", async () => {
    const setup = await createSetup("liushi-implementation-command-dirty-");
    await writeFile(join(setup.worktreeRoot, "src", "index.ts"), "pre-existing dirty\n");

    const result = await setup.application.implementationCommands.execute(
      implementationCommand(setup),
      runtime(setup),
    );
    const journal = await setup.application.getActionJournal.execute({
      workspaceId,
      taskId: sourceTaskId,
      actionId,
    });

    expect(result).toMatchObject({
      status: ResultStatus.Success,
      value: { status: CommandStatus.OutcomeUnknown },
    });
    expect(journal).toMatchObject({
      status: ResultStatus.Success,
      value: { status: ActionJournalStatus.WaitingHuman },
    });
  });
});

/** 真实 Git 与持久化 Store 组成的测试运行环境。 */
interface Setup {
  readonly storeRoot: string;
  readonly repositoryRoot: string;
  readonly worktreeRoot: string;
  readonly baseRevision: string;
  readonly initialContent: string;
  readonly application: ReturnType<typeof createApplication>;
}

/** 创建一个洁净的 Managed Worktree 和运行中的 Coding Attempt。 */
async function createSetup(prefix: string): Promise<Setup> {
  const storeRoot = await stores.create(prefix);
  const repositoryRoot = await mkdtemp(join(tmpdir(), "liushi-implementation-repo-"));
  repositories.push(repositoryRoot);
  await runGit(repositoryRoot, ["init", "-b", "main"]);
  await mkdir(join(repositoryRoot, "src"));
  await writeFile(join(repositoryRoot, "src", "index.ts"), "export const value = 1;\n");
  await runGit(repositoryRoot, ["add", "."]);
  await runGit(repositoryRoot, [
    "-c",
    "user.name=liushi-test",
    "-c",
    "user.email=test@example.com",
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
    "feature/implementation",
    worktreeRoot,
    baseRevision,
  ]);
  const application = createApplication(storeRoot);
  await application.createTask.execute({
    workspaceId,
    source: "implementation-test",
    actor: { kind: ActorKind.Human, actorId: "human" },
  });
  await createCodingTask(application, baseRevision);
  const initialContent = await readFile(join(worktreeRoot, "src", "index.ts"), "utf8");
  return { storeRoot, repositoryRoot, worktreeRoot, baseRevision, initialContent, application };
}

function createApplication(storeRoot: string) {
  return createHarnessApplication({
    storeRoot,
    taskIdGenerator: { next: () => sourceTaskId },
    codingTaskAuthorizationResolver: {
      resolve: ({ requested }) =>
        Promise.resolve({ status: ResultStatus.Success, value: requested }),
    },
  });
}

async function createCodingTask(
  application: ReturnType<typeof createApplication>,
  baseRevision: string,
): Promise<void> {
  await application.codingTaskCommands.execute(
    codingCommand(CodingTaskCommandType.Create, "create", 0, {
      workspaceId,
      sourceTaskId,
      repositoryId: "repo-1",
      baseRevision,
      worktreeBinding: {
        worktreeId: "worktree-1",
        relativePath: "worktrees/task",
        branchName: "feature/implementation",
        managed: true,
      },
      writeSet: ["src/index.ts", "src/new.ts"],
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
    codingCommand(CodingTaskCommandType.StartAttempt, "start", 1, {
      workspaceId,
      attemptNumber: 1,
    }),
  );
}

function implementationCommand(
  setup: Setup,
  expectedDigest = unwrap(digest.calculate(setup.initialContent)),
) {
  const payload = {
    workspaceId,
    actionId,
    attemptNumber: 1,
    runtimeRootDigest: unwrap(digest.calculate(runtime(setup))),
    mutations: [
      {
        path: "src/index.ts",
        kind: FileMutationKind.Replace,
        expectedContentDigest: expectedDigest,
        content: "export const value = 2;\n",
        contentDigest: unwrap(digest.calculate("export const value = 2;\n")),
      },
      {
        path: "src/new.ts",
        kind: FileMutationKind.Create,
        content: "export const created = true;\n",
        contentDigest: unwrap(digest.calculate("export const created = true;\n")),
      },
    ],
  };
  return {
    schemaVersion: "1.0.0",
    commandId: "implementation-command-1",
    commandType: IMPLEMENTATION_APPLY_COMMAND_TYPE,
    aggregateType: "coding_task",
    aggregateId: codingTaskId,
    expectedVersion: 2,
    idempotencyKey: "implementation-command-1",
    requestDigest: unwrap(digest.calculate(payload)),
    actor: { kind: ActorKind.Agent, actorId: "agent" },
    authorizationContext: {},
    correlationId: "implementation-correlation",
    submittedAt: "2026-07-12T00:00:00.000Z",
    payload,
  };
}

function runtime(setup: Setup) {
  return { repositoryRoot: setup.repositoryRoot, worktreeRoot: setup.worktreeRoot };
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
    correlationId: "implementation-correlation",
    submittedAt: "2026-07-12T00:00:00.000Z",
    payload,
  };
}

async function runGit(cwd: string, args: readonly string[]): Promise<string> {
  const result = await new NodeCommandRunnerAdapter().run({
    executable: "git",
    args,
    cwd,
    timeoutMs: 10_000,
  });
  if (result.status === ResultStatus.Failure || result.value.exitCode !== 0)
    throw new Error("Git 测试命令失败。");
  return result.value.stdout.trim();
}

function unwrap<T>(result: { status: ResultStatus; value?: T; error?: Error }): T {
  if (result.status !== ResultStatus.Success || result.value === undefined)
    throw new Error(result.error?.message ?? "测试值解析失败。");
  return result.value;
}
