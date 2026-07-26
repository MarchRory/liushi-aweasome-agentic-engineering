import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { GitCommittedChangeSetInspectorPort } from "../../src/application/ports/gitCommittedChangeSetInspector/index.js";
import type { GitChangeSetInspectorPort } from "../../src/application/ports/gitChangeSetInspector/index.js";
import { ResultStatus } from "../../src/common/index.js";
import { CodingTaskSessionChangeKind } from "../../src/domain/index.js";
import { parseRepositoryId, type RepositoryId } from "../../src/domain/workspace/index.js";
import {
  NodeGitChangeSetInspectorAdapter,
  NodeGitCommittedChangeSetInspectorAdapter,
  NodeWorktreeInspectorAdapter,
  Rfc8785Sha256DigestAdapter,
} from "../../src/infrastructure/index.js";
import { NodeCommandRunnerAdapter } from "../../src/infrastructure/system/index.js";

const fixtureRoots: string[] = [];
const repositoryId = requireSuccess(parseRepositoryId("git-committed-change-set"));

afterEach(async () => {
  await Promise.all(
    fixtureRoots.splice(0).map((fixtureRoot) => rm(fixtureRoot, { recursive: true, force: true })),
  );
});

describe("Node Git Committed ChangeSet Inspector Adapter", () => {
  it("重建 modified 与提交后的原 untracked Added，并保持 pre-submit digest", async () => {
    const fixture = await createFixture();
    const modifiedBytes = Buffer.from("修改后的内容\n");
    const addedBytes = Buffer.from("提交前未跟踪、提交后新增\n");
    await writeFile(join(fixture.worktreeRoot, "src", "modified.txt"), modifiedBytes);
    await writeFile(join(fixture.worktreeRoot, "src", "added.txt"), addedBytes);

    const writeSet = ["src/added.txt", "src/modified.txt"];
    const preSubmit = requireSuccess(await inspectPreSubmit(fixture, writeSet));
    const targetRevision = await commitTarget(fixture.worktreeRoot, "modified and added");
    const committed = requireSuccess(await inspectCommitted(fixture, writeSet, targetRevision));

    expect(committed.changeSetDigest).toBe(preSubmit.changeSetDigest);
    expect(committed.changes).toEqual([
      {
        path: "src/added.txt",
        kind: CodingTaskSessionChangeKind.Added,
        targetContentDigest: rawDigest(addedBytes),
      },
      {
        path: "src/modified.txt",
        kind: CodingTaskSessionChangeKind.Modified,
        targetContentDigest: rawDigest(modifiedBytes),
      },
    ]);
  }, 30_000);

  it("重建 rename 与 delete，并保持 pre-submit digest", async () => {
    const fixture = await createFixture();
    const originalBytes = await readFile(join(fixture.worktreeRoot, "src", "old.txt"));
    await runGit(fixture.worktreeRoot, ["mv", "src/old.txt", "src/renamed.txt"]);
    await rm(join(fixture.worktreeRoot, "src", "deleted.txt"));

    const writeSet = ["src/deleted.txt", "src/old.txt", "src/renamed.txt"];
    const preSubmit = requireSuccess(await inspectPreSubmit(fixture, writeSet));
    const targetRevision = await commitTarget(fixture.worktreeRoot, "rename and delete");
    const committed = requireSuccess(await inspectCommitted(fixture, writeSet, targetRevision));
    expect(committed.changeSetDigest).toBe(preSubmit.changeSetDigest);
    expect(committed.changes).toEqual([
      {
        path: "src/deleted.txt",
        kind: CodingTaskSessionChangeKind.Deleted,
        targetContentDigest: null,
      },
      {
        path: "src/old.txt",
        kind: CodingTaskSessionChangeKind.Deleted,
        targetContentDigest: null,
      },
      {
        path: "src/renamed.txt",
        kind: CodingTaskSessionChangeKind.Added,
        targetContentDigest: rawDigest(originalBytes),
      },
    ]);
  }, 30_000);

  it("保持未 staged filesystem rename 与提交后 Git rename 的 digest parity", async () => {
    const fixture = await createFixture();
    const originalBytes = await readFile(join(fixture.worktreeRoot, "src", "old.txt"));
    await rename(
      join(fixture.worktreeRoot, "src", "old.txt"),
      join(fixture.worktreeRoot, "src", "filesystem-renamed.txt"),
    );

    const writeSet = ["src/filesystem-renamed.txt", "src/old.txt"];
    const preSubmit = requireSuccess(await inspectPreSubmit(fixture, writeSet));
    expect(preSubmit.changes).toEqual([
      {
        path: "src/filesystem-renamed.txt",
        kind: CodingTaskSessionChangeKind.Added,
        targetContentDigest: rawDigest(originalBytes),
      },
      {
        path: "src/old.txt",
        kind: CodingTaskSessionChangeKind.Deleted,
        targetContentDigest: null,
      },
    ]);

    const targetRevision = await commitTarget(fixture.worktreeRoot, "filesystem rename");
    const rawDiff = await runGitRaw(fixture.worktreeRoot, [
      "diff",
      "--name-status",
      "-z",
      "--find-renames",
      fixture.baseRevision,
      targetRevision,
      "--",
    ]);
    expect(rawDiff).toContain("R100\u0000src/old.txt\u0000src/filesystem-renamed.txt\u0000");

    const committed = requireSuccess(await inspectCommitted(fixture, writeSet, targetRevision));
    expect(committed.changeSetDigest).toBe(preSubmit.changeSetDigest);
    expect(committed.changes).toEqual(preSubmit.changes);
  }, 30_000);

  it("规范化 status 的 Added 与 commit diff 的 Copied 语义漂移", async () => {
    const fixture = await createFixture();
    const copiedBytes = await readFile(join(fixture.worktreeRoot, "src", "old.txt"));
    await writeFile(join(fixture.worktreeRoot, "src", "old.txt"), "源文件同时修改\n");
    await writeFile(join(fixture.worktreeRoot, "src", "copy.txt"), copiedBytes);

    const writeSet = ["src/copy.txt", "src/old.txt"];
    const rawStatus = await runGitRaw(fixture.worktreeRoot, ["status", "--porcelain=v1", "-z"]);
    expect(rawStatus).toContain(" M src/old.txt\u0000");
    expect(rawStatus).toContain("?? src/copy.txt\u0000");
    const preSubmit = requireSuccess(await inspectPreSubmit(fixture, writeSet));
    const targetRevision = await commitTarget(fixture.worktreeRoot, "copy with source change");
    const rawDiff = await runGitRaw(fixture.worktreeRoot, [
      "diff",
      "--name-status",
      "-z",
      "--find-renames",
      "--find-copies",
      fixture.baseRevision,
      targetRevision,
      "--",
    ]);
    expect(rawDiff).toContain("C100\u0000src/old.txt\u0000src/copy.txt\u0000");

    const committed = requireSuccess(await inspectCommitted(fixture, writeSet, targetRevision));
    expect(committed.changeSetDigest).toBe(preSubmit.changeSetDigest);
    expect(committed.changes).toEqual([
      {
        path: "src/copy.txt",
        kind: CodingTaskSessionChangeKind.Added,
        targetContentDigest: rawDigest(copiedBytes),
      },
      {
        path: "src/old.txt",
        kind: CodingTaskSessionChangeKind.Modified,
        targetContentDigest: rawDigest(Buffer.from("源文件同时修改\n")),
      },
    ]);
  }, 30_000);

  it("对 dirty target、branch drift 与 HEAD drift fail closed", async () => {
    const fixture = await createFixture();
    const modifiedBytes = Buffer.from("目标提交内容\n");
    const writeSet = ["src/modified.txt"];
    await writeFile(join(fixture.worktreeRoot, "src", "modified.txt"), modifiedBytes);
    const targetRevision = await commitTarget(fixture.worktreeRoot, "target");

    await writeFile(join(fixture.worktreeRoot, "src", "modified.txt"), "目标之后的 dirty\n");
    expect((await inspectCommitted(fixture, writeSet, targetRevision)).status).toBe(
      ResultStatus.Failure,
    );
    await writeFile(join(fixture.worktreeRoot, "src", "modified.txt"), modifiedBytes);

    expect(
      (
        await inspectCommitted(fixture, writeSet, targetRevision, {
          branchName: "task/drifted",
        })
      ).status,
    ).toBe(ResultStatus.Failure);

    await writeFile(join(fixture.worktreeRoot, "src", "modified.txt"), "HEAD 漂移\n");
    await commitTarget(fixture.worktreeRoot, "head drift");
    expect((await inspectCommitted(fixture, writeSet, targetRevision)).status).toBe(
      ResultStatus.Failure,
    );
  }, 30_000);
});

/** 集成测试使用的临时 Git 仓库与受管 Worktree。 */
interface Fixture {
  readonly repositoryRoot: string;
  readonly worktreeRoot: string;
  readonly relativePath: string;
  readonly branchName: string;
  readonly baseRevision: string;
  readonly repositoryId: RepositoryId;
}

async function createFixture(): Promise<Fixture> {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "liushi-committed-change-set-"));
  fixtureRoots.push(repositoryRoot);
  await runGit(repositoryRoot, ["init", "-b", "main"]);
  await mkdir(join(repositoryRoot, "src"));
  await writeFile(join(repositoryRoot, "src", "modified.txt"), "初始内容\n");
  await writeFile(join(repositoryRoot, "src", "old.txt"), "待重命名\n");
  await writeFile(join(repositoryRoot, "src", "deleted.txt"), "待删除\n");
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
  const relativePath = "managed-worktree";
  const branchName = "task/worktree";
  await runGit(repositoryRoot, ["worktree", "add", "-b", branchName, relativePath, baseRevision]);
  return {
    repositoryRoot,
    worktreeRoot: join(repositoryRoot, relativePath),
    relativePath,
    branchName,
    baseRevision,
    repositoryId,
  };
}

function inspectPreSubmit(
  fixture: Fixture,
  writeSet: readonly string[],
): ReturnType<GitChangeSetInspectorPort["inspectPreSubmit"]> {
  return new NodeGitChangeSetInspectorAdapter(
    new NodeWorktreeInspectorAdapter(new NodeCommandRunnerAdapter()),
    new Rfc8785Sha256DigestAdapter(),
  ).inspectPreSubmit({
    repositoryId: fixture.repositoryId,
    repositoryRoot: fixture.repositoryRoot,
    worktreeBinding: createBinding(fixture),
    baseRevision: fixture.baseRevision,
    writeSet,
  });
}

function inspectCommitted(
  fixture: Fixture,
  writeSet: readonly string[],
  targetRevision: string,
  override: { readonly branchName?: string } = {},
): ReturnType<GitCommittedChangeSetInspectorPort["inspectCommitted"]> {
  return new NodeGitCommittedChangeSetInspectorAdapter(
    new NodeCommandRunnerAdapter(),
    new NodeWorktreeInspectorAdapter(new NodeCommandRunnerAdapter()),
    new Rfc8785Sha256DigestAdapter(),
  ).inspectCommitted({
    repositoryId: fixture.repositoryId,
    repositoryRoot: fixture.repositoryRoot,
    worktreeBinding: { ...createBinding(fixture), ...override },
    baseRevision: fixture.baseRevision,
    targetRevision,
    writeSet,
  });
}

function createBinding(fixture: Fixture) {
  return {
    worktreeId: "managed-task",
    relativePath: fixture.relativePath,
    branchName: fixture.branchName,
    managed: true,
  } as const;
}

async function commitTarget(worktreeRoot: string, message: string): Promise<string> {
  await runGit(worktreeRoot, ["add", "--all"]);
  await runGit(worktreeRoot, [
    "-c",
    "user.name=liushi-test",
    "-c",
    "user.email=liushi-test@example.com",
    "commit",
    "-m",
    message,
  ]);
  return runGit(worktreeRoot, ["rev-parse", "HEAD"]);
}

async function runGit(cwd: string, args: readonly string[]): Promise<string> {
  return (await runGitRaw(cwd, args)).trim();
}

async function runGitRaw(cwd: string, args: readonly string[]): Promise<string> {
  const result = await new NodeCommandRunnerAdapter().run({
    executable: "git",
    args,
    cwd,
    timeoutMs: 10_000,
  });
  return requireSuccess(result).stdout;
}

function rawDigest(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function requireSuccess<T>(result: {
  readonly status: ResultStatus;
  readonly value?: T;
  readonly error?: unknown;
}): T {
  if (result.status !== ResultStatus.Success || result.value === undefined) {
    throw new Error(`测试 fixture 构造失败：${String(result.error)}`);
  }
  return result.value;
}
