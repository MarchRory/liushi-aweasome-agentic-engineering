import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import { ResultStatus, success } from "../../src/common/index.js";
import type { RepositoryId } from "../../src/domain/workspace/index.js";
import { parseRepositoryId } from "../../src/domain/workspace/index.js";
import { CodingTaskSessionChangeKind } from "../../src/domain/index.js";
import type { GitChangeSetInspectorPort } from "../../src/application/ports/gitChangeSetInspector/index.js";
import {
  WorktreeChangeKind,
  WorktreeInspectionStatus,
  type WorktreeInspectionReport,
  type WorktreeInspectorPort,
} from "../../src/application/ports/worktree/index.js";
import {
  NodeGitChangeSetInspectorAdapter,
  NodeWorktreeInspectorAdapter,
} from "../../src/infrastructure/index.js";
import { NodeCommandRunnerAdapter } from "../../src/infrastructure/system/index.js";
import { Rfc8785Sha256DigestAdapter } from "../../src/infrastructure/serialization/index.js";

const fixtures: string[] = [];
const repositoryId = requireSuccess(parseRepositoryId("git-change-set-inspector"));

afterEach(async () => {
  await Promise.all(
    fixtures.splice(0).map((fixture) => rm(fixture, { recursive: true, force: true })),
  );
});

describe("Node Git ChangeSet Inspector Adapter", () => {
  it("读取文本与未跟踪二进制的原始字节摘要，并保证重复现场摘要一致", async () => {
    const fixture = await createFixture();
    const binary = Buffer.from([0, 1, 255, 16, 128]);
    await writeFile(join(fixture.worktreeRoot, "src", "modified.txt"), "修改后的文本\n");
    await mkdir(join(fixture.worktreeRoot, "assets"));
    await writeFile(join(fixture.worktreeRoot, "assets", "new.bin"), binary);

    const first = requireSuccess(await inspect(fixture, ["assets/new.bin", "src/modified.txt"]));
    const second = requireSuccess(await inspect(fixture, ["assets/new.bin", "src/modified.txt"]));
    const binaryChange = first.changes.find((change) => change.path === "assets/new.bin");
    const textChange = first.changes.find((change) => change.path === "src/modified.txt");

    expect(first.changes.map((change) => change.path)).toEqual([
      "assets/new.bin",
      "src/modified.txt",
    ]);
    expect(first.changedPaths).toEqual(["assets/new.bin", "src/modified.txt"]);
    expect(binaryChange?.targetContentDigest).toBe(rawDigest(binary));
    expect(textChange?.targetContentDigest).toBe(rawDigest(Buffer.from("修改后的文本\n")));
    expect(first.changeSetDigest).toBe(second.changeSetDigest);
    expect(first.snapshotDigest).toBe(second.snapshotDigest);
  }, 30_000);

  it("记录 rename 的原始路径与目标摘要，并为 delete 使用 null 摘要", async () => {
    const fixture = await createFixture();
    const originalBytes = await readFile(join(fixture.worktreeRoot, "src", "old.txt"));
    await runGit(fixture.worktreeRoot, ["mv", "src/old.txt", "src/new.txt"]);
    await rm(join(fixture.worktreeRoot, "src", "deleted.txt"));

    const result = requireSuccess(
      await inspect(fixture, ["src/deleted.txt", "src/new.txt", "src/old.txt"]),
    );
    const renamed = result.changes.find(
      (change) => change.kind === CodingTaskSessionChangeKind.Renamed,
    );
    const deleted = result.changes.find((change) => change.path === "src/deleted.txt");

    expect(renamed).toMatchObject({
      path: "src/new.txt",
      originalPath: "src/old.txt",
      kind: "renamed",
      targetContentDigest: rawDigest(originalBytes),
    });
    expect(deleted).toMatchObject({
      path: "src/deleted.txt",
      targetContentDigest: null,
    });
    expect(result.changedPaths).toEqual(["src/deleted.txt", "src/new.txt", "src/old.txt"]);
  }, 30_000);

  it("对 clean、Write Set violation、base 或 branch drift 以及目录特殊文件 fail closed", async () => {
    const clean = await createFixture();
    expect((await inspect(clean, ["src/modified.txt"])).status).toBe(ResultStatus.Failure);

    const violation = await createFixture();
    await writeFile(join(violation.worktreeRoot, "outside.txt"), "越界\n");
    expect((await inspect(violation, ["src/modified.txt"])).status).toBe(ResultStatus.Failure);

    const baseDrift = await createFixture();
    await writeFile(join(baseDrift.worktreeRoot, "src", "modified.txt"), "已提交漂移\n");
    await runGit(baseDrift.worktreeRoot, ["add", "."]);
    await runGit(baseDrift.worktreeRoot, [
      "-c",
      "user.name=liushi-test",
      "-c",
      "user.email=liushi-test@example.com",
      "commit",
      "-m",
      "drift",
    ]);
    expect((await inspect(baseDrift, ["src/modified.txt"])).status).toBe(ResultStatus.Failure);

    const branchDrift = await createFixture();
    expect((await inspect(branchDrift, ["src/modified.txt"], "other/branch")).status).toBe(
      ResultStatus.Failure,
    );

    const special = await createFixture();
    await rm(join(special.worktreeRoot, "src", "special.txt"));
    await mkdir(join(special.worktreeRoot, "src", "special.txt"));
    expect((await inspect(special, ["src/special.txt"])).status).toBe(ResultStatus.Failure);
  }, 60_000);

  it("两次 Worktree 现场不一致时 fail closed", async () => {
    const fixture = await createFixture();
    const change = {
      path: "src/modified.txt",
      kind: WorktreeChangeKind.Modified,
    } as const;
    const first = createReport(fixture, fixture.baseRevision, change);
    const second = createReport(fixture, "b".repeat(40), change);
    const inspector: WorktreeInspectorPort = new ControlledInspector([first, second]);
    const adapter: GitChangeSetInspectorPort = new NodeGitChangeSetInspectorAdapter(
      inspector,
      new Rfc8785Sha256DigestAdapter(),
    );
    const result = await adapter.inspectPreSubmit(inputFor(fixture, ["src/modified.txt"]));

    expect(result.status).toBe(ResultStatus.Failure);
  });
});

/** 集成测试使用的临时 Git 仓库与受管 Worktree。 */
interface Fixture {
  repositoryRoot: string;
  worktreeRoot: string;
  relativePath: string;
  branchName: string;
  baseRevision: string;
  repositoryId: RepositoryId;
}

async function createFixture(): Promise<Fixture> {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "liushi-change-set-"));
  fixtures.push(repositoryRoot);
  await runGit(repositoryRoot, ["init", "-b", "main"]);
  await mkdir(join(repositoryRoot, "src"));
  await writeFile(join(repositoryRoot, "src", "modified.txt"), "初始文本\n");
  await writeFile(join(repositoryRoot, "src", "old.txt"), "待重命名\n");
  await writeFile(join(repositoryRoot, "src", "deleted.txt"), "待删除\n");
  await writeFile(join(repositoryRoot, "src", "special.txt"), "普通文件\n");
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

function inspect(
  fixture: Fixture,
  writeSet: readonly string[],
  branchName = fixture.branchName,
): ReturnType<GitChangeSetInspectorPort["inspectPreSubmit"]> {
  const adapter: GitChangeSetInspectorPort = new NodeGitChangeSetInspectorAdapter(
    new NodeWorktreeInspectorAdapter(new NodeCommandRunnerAdapter()),
    new Rfc8785Sha256DigestAdapter(),
  );
  return adapter.inspectPreSubmit({
    ...inputFor(fixture, writeSet),
    worktreeBinding: { ...inputFor(fixture, writeSet).worktreeBinding, branchName },
  });
}

function inputFor(fixture: Fixture, writeSet: readonly string[]) {
  return {
    repositoryId: fixture.repositoryId,
    repositoryRoot: fixture.repositoryRoot,
    worktreeBinding: {
      worktreeId: "managed-task",
      relativePath: fixture.relativePath,
      branchName: fixture.branchName,
      managed: true,
    },
    baseRevision: fixture.baseRevision,
    writeSet,
  };
}

function createReport(
  fixture: Fixture,
  actualHeadRevision: string,
  change: WorktreeInspectionReport["changes"][number],
): WorktreeInspectionReport {
  return {
    repositoryId: fixture.repositoryId,
    worktreeId: "managed-task",
    worktreeRelativePath: fixture.relativePath,
    expectedBranchName: fixture.branchName,
    actualBranchName: fixture.branchName,
    declaredBaseRevision: fixture.baseRevision,
    resolvedBaseRevision: fixture.baseRevision,
    actualHeadRevision,
    status: WorktreeInspectionStatus.Dirty,
    writeSet: ["src/modified.txt"],
    changedPaths: ["src/modified.txt"],
    writeSetViolations: [],
    changes: [change],
    diagnostics: [],
  };
}

/** 按预设顺序返回现场报告的可控 Inspector。 */
class ControlledInspector implements WorktreeInspectorPort {
  private index = 0;

  public constructor(private readonly reports: readonly WorktreeInspectionReport[]) {}

  public inspect(): ReturnType<WorktreeInspectorPort["inspect"]> {
    const report = this.reports[Math.min(this.index++, this.reports.length - 1)];
    if (report === undefined) throw new Error("测试 fixture 缺少 Worktree 报告。");
    return Promise.resolve(success(report));
  }
}

async function runGit(cwd: string, args: readonly string[]): Promise<string> {
  const result = await new NodeCommandRunnerAdapter().run({
    executable: "git",
    args,
    cwd,
    timeoutMs: 10_000,
  });
  return requireSuccess(result).stdout.trim();
}

function rawDigest(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function requireSuccess<T>(result: { status: ResultStatus; value?: T; error?: unknown }): T {
  if (result.status !== ResultStatus.Success || result.value === undefined) {
    throw new Error(`测试 fixture 构造失败：${String(result.error)}`);
  }
  return result.value;
}
