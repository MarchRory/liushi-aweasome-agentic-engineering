import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import {
  ActorKind,
  ActionJournalStatus,
  CodingTaskCommandType,
  CommandErrorCode,
  CommandStatus,
  ResultStatus,
  WORKTREE_PROVISION_COMMAND_TYPE,
  createHarnessApplication,
} from "../../src/index.js";
import {
  NodeCommandRunnerAdapter,
  Rfc8785Sha256DigestAdapter,
} from "../../src/infrastructure/index.js";
import { TemporaryRuntimeStore } from "../support/runtime/index.js";

const runtimeStores = new TemporaryRuntimeStore();
const repositories: string[] = [];
const workspaceId = "worktree-provision-workspace";
const codingTaskId = "worktree-provision-task";
const sourceTaskId = "01ARZ3NDEKTSV4RRFFQ69G5FB2";
const actionId = "01ARZ3NDEKTSV4RRFFQ69G5FC1";
const submittedAt = "2026-07-12T00:00:00.000Z";
const digest = new Rfc8785Sha256DigestAdapter();

afterEach(async () => {
  await runtimeStores.cleanup();
  await Promise.all(
    repositories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("Managed Worktree Provision Command", () => {
  it("经 Gateway、Repository Lock 和 Journal 创建 Worktree，并跨实例复用 Receipt", async () => {
    const fixture = await createRepository();
    const storeRoot = await runtimeStores.create("liushi-worktree-provision-");
    const application = createApplication(storeRoot);
    await createSourceTask(application);
    await createCodingTask(application, fixture.baseRevision);
    const command = provisionCommand(fixture.repositoryRoot);

    const first = await application.worktreeProvisionCommands.execute(command, {
      repositoryRoot: fixture.repositoryRoot,
    });
    const journal = await application.getActionJournal.execute({
      workspaceId,
      taskId: sourceTaskId,
      actionId,
    });
    expect(first, JSON.stringify({ first, journal })).toMatchObject({
      status: ResultStatus.Success,
      value: { status: CommandStatus.Committed, committedVersion: 1 },
    });
    expect(journal).toMatchObject({
      status: ResultStatus.Success,
      value: { status: ActionJournalStatus.Committed },
    });

    const restarted = createApplication(storeRoot);
    const duplicate = await restarted.worktreeProvisionCommands.execute(command, {
      repositoryRoot: fixture.repositoryRoot,
    });
    expect(duplicate).toEqual(first);
    expect(
      await runGit(join(fixture.repositoryRoot, "worktrees", "task"), ["branch", "--show-current"]),
    ).toBe("feature/worktree-provision");
    expect(
      await runGit(join(fixture.repositoryRoot, "worktrees", "task"), ["rev-parse", "HEAD"]),
    ).toBe(fixture.baseRevision);
  });

  it("Runtime Root Digest 不匹配时在 Git 写入前拒绝", async () => {
    const fixture = await createRepository();
    const otherRoot = await mkdtemp(join(tmpdir(), "liushi-worktree-other-"));
    repositories.push(otherRoot);
    const storeRoot = await runtimeStores.create("liushi-worktree-binding-");
    const application = createApplication(storeRoot);
    await createSourceTask(application);
    await createCodingTask(application, fixture.baseRevision);

    const rejected = await application.worktreeProvisionCommands.execute(
      provisionCommand(fixture.repositoryRoot),
      { repositoryRoot: otherRoot },
    );
    expect(rejected.status).toBe(ResultStatus.Failure);
    await expect(
      runGit(fixture.repositoryRoot, [
        "show-ref",
        "--verify",
        "refs/heads/feature/worktree-provision",
      ]),
    ).rejects.toThrow();
  });

  it("Repository Root 是 symlink 或 junction 时在 Git 写入前拒绝", async (context) => {
    const fixture = await createRepository();
    const linkParent = await mkdtemp(join(tmpdir(), "liushi-worktree-linked-root-"));
    repositories.push(linkParent);
    const linkedRoot = join(linkParent, "repository");
    try {
      await symlink(
        fixture.repositoryRoot,
        linkedRoot,
        process.platform === "win32" ? "junction" : "dir",
      );
    } catch {
      context.skip();
      return;
    }

    const storeRoot = await runtimeStores.create("liushi-worktree-linked-binding-");
    const application = createApplication(storeRoot);
    await createSourceTask(application);
    await createCodingTask(application, fixture.baseRevision);

    const rejected = await application.worktreeProvisionCommands.execute(
      provisionCommand(linkedRoot),
      { repositoryRoot: linkedRoot },
    );

    expect(rejected).toMatchObject({
      status: ResultStatus.Success,
      value: {
        status: CommandStatus.Rejected,
        errorCode: CommandErrorCode.AuthorizationDenied,
      },
    });
    await expect(
      runGit(fixture.repositoryRoot, [
        "show-ref",
        "--verify",
        "refs/heads/feature/worktree-provision",
      ]),
    ).rejects.toThrow();
  });
});

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

async function createSourceTask(application: ReturnType<typeof createApplication>): Promise<void> {
  const result = await application.createTask.execute({
    workspaceId,
    source: "worktree-provision-integration",
    actor: { kind: ActorKind.Human, actorId: "human" },
  });
  expect(result.status).toBe(ResultStatus.Success);
}

async function createCodingTask(
  application: ReturnType<typeof createApplication>,
  baseRevision: string,
): Promise<void> {
  const result = await application.codingTaskCommands.execute({
    schemaVersion: "1.0.0",
    commandId: "create-worktree-provision-task",
    commandType: CodingTaskCommandType.Create,
    aggregateType: "coding_task",
    aggregateId: codingTaskId,
    expectedVersion: 0,
    idempotencyKey: "create-worktree-provision-task",
    requestDigest: `sha256:${"a".repeat(64)}`,
    actor: { kind: ActorKind.Human, actorId: "human" },
    authorizationContext: {},
    correlationId: "worktree-provision-correlation",
    submittedAt,
    payload: {
      workspaceId,
      sourceTaskId,
      repositoryId: "repo-1",
      baseRevision,
      worktreeBinding: {
        worktreeId: "worktree-1",
        relativePath: "worktrees/task",
        branchName: "feature/worktree-provision",
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
    },
  });
  expect(result).toMatchObject({ value: { status: CommandStatus.Committed } });
}

function provisionCommand(repositoryRoot: string) {
  const rootDigest = unwrap(digest.calculate({ repositoryRoot }));
  const payload = { workspaceId, actionId, repositoryRootDigest: rootDigest };
  return {
    schemaVersion: "1.0.0",
    commandId: "provision-worktree-1",
    commandType: WORKTREE_PROVISION_COMMAND_TYPE,
    aggregateType: "coding_task",
    aggregateId: codingTaskId,
    expectedVersion: 1,
    idempotencyKey: "provision-worktree-1",
    requestDigest: unwrap(digest.calculate(payload)),
    actor: { kind: ActorKind.Agent, actorId: "agent" },
    authorizationContext: {},
    correlationId: "worktree-provision-correlation",
    submittedAt,
    payload,
  };
}

async function createRepository(): Promise<{ repositoryRoot: string; baseRevision: string }> {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "liushi-worktree-provision-repo-"));
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
