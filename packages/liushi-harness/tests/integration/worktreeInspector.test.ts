import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import {
  HarnessErrorCode,
  ResultStatus,
  success,
  type HarnessError,
  type Result,
} from "../../src/common/index.js";
import { parseRepositoryId } from "../../src/domain/workspace/index.js";
import {
  WorktreeInspectionDiagnosticCode,
  WorktreeInspectionStatus,
  WorktreeGitOperation,
  type WorktreeInspectionReport,
} from "../../src/application/ports/worktree/index.js";
import { NodeWorktreeInspectorAdapter } from "../../src/infrastructure/worktree/index.js";
import {
  NodeCommandRunnerAdapter,
  type CommandRunRequest,
  type CommandRunResult,
  type CommandRunner,
} from "../../src/infrastructure/system/index.js";

const repositoryId = parseRepositoryId("worktree-test");
const fixtures: string[] = [];

afterEach(async () => {
  await Promise.all(
    fixtures.splice(0).map((fixture) => rm(fixture, { recursive: true, force: true })),
  );
});

describe("Node Worktree Inspector Adapter", () => {
  it("在 clean worktree 上返回 Ready，并且只执行只读 Git 命令", async () => {
    const fixture = await createFixture();
    const calls: CommandRunRequest[] = [];
    const runner = recordingRunner(calls);
    const result = await inspect(fixture, runner);

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Failure) return;
    expect(result.value.status).toBe(WorktreeInspectionStatus.Ready);
    expect(result.value.actualBranchName).toBe(fixture.branchName);
    expect(result.value.actualHeadRevision).toBe(fixture.baseRevision);
    expect(result.value.changedPaths).toEqual([]);
    expect(calls.every((call) => call.cwd === fixture.worktreeRoot)).toBe(true);
    expect(calls.map((call) => call.args[0])).toEqual([
      "rev-parse",
      "branch",
      "rev-parse",
      "rev-parse",
      "status",
    ]);
    expect(
      calls.some((call) => ["worktree", "reset", "checkout", "merge"].includes(call.args[0] ?? "")),
    ).toBe(false);
  });

  it("将 Write Set 内的 dirty path 报告为 Dirty", async () => {
    const fixture = await createFixture();
    await writeFile(join(fixture.worktreeRoot, "src", "allowed.ts"), "export const value = 2;\n");

    const result = await inspect(fixture, new NodeCommandRunnerAdapter(), ["src/allowed.ts"]);

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Failure) return;
    expect(result.value.status).toBe(WorktreeInspectionStatus.Dirty);
    expect(result.value.writeSetViolations).toEqual([]);
    expect(result.value.changedPaths).toEqual(["src/allowed.ts"]);
  });

  it("将 Write Set 外的 dirty path fail closed 为 WriteSetViolation", async () => {
    const fixture = await createFixture();
    await writeFile(join(fixture.worktreeRoot, "src", "outside.ts"), "export const value = 3;\n");

    const result = await inspect(fixture, new NodeCommandRunnerAdapter(), ["src/allowed.ts"]);

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Failure) return;
    expect(result.value.status).toBe(WorktreeInspectionStatus.WriteSetViolation);
    expect(result.value.writeSetViolations).toEqual(["src/outside.ts"]);
    expect(result.value.diagnostics).toContainEqual({
      code: WorktreeInspectionDiagnosticCode.DirtyPathOutsideWriteSet,
      operation: WorktreeGitOperation.ReadStatus,
      path: "src/outside.ts",
    });
  });

  it("识别 Base Revision 漂移和分支不匹配", async () => {
    const fixture = await createFixture();
    await writeFile(join(fixture.worktreeRoot, "src", "base.ts"), "export const value = 4;\n");
    await runGit(fixture.worktreeRoot, ["add", "."]);
    await runGit(fixture.worktreeRoot, [
      "-c",
      "user.name=liushi-test",
      "-c",
      "user.email=liushi-test@example.com",
      "commit",
      "-m",
      "drift",
    ]);

    const drift = await inspect(fixture, new NodeCommandRunnerAdapter());
    expect(drift.status).toBe(ResultStatus.Success);
    if (drift.status === ResultStatus.Failure) return;
    expect(drift.value.status).toBe(WorktreeInspectionStatus.BaseRevisionDrift);

    const branchFixture = await createFixture();
    const branchMismatch = await inspect(
      branchFixture,
      new NodeCommandRunnerAdapter(),
      undefined,
      "other",
    );
    expect(branchMismatch.status).toBe(ResultStatus.Success);
    if (branchMismatch.status === ResultStatus.Failure) return;
    expect(branchMismatch.value.status).toBe(WorktreeInspectionStatus.BranchMismatch);
    expect(branchMismatch.value.diagnostics).toContainEqual({
      code: WorktreeInspectionDiagnosticCode.BranchMismatch,
      operation: WorktreeGitOperation.ResolveBranch,
    });
  }, 30_000);

  it("拒绝通过 Junction 越出 Repository Root 的 Worktree 路径", async () => {
    const fixture = await createFixture();
    const outsideRoot = await mkdtemp(join(tmpdir(), "liushi-worktree-outside-"));
    const escapedPath = join(fixture.repositoryRoot, "worktrees", "escaped");
    try {
      await symlink(outsideRoot, escapedPath, "junction");
      const result = await inspect(
        fixture,
        new NodeCommandRunnerAdapter(),
        ["src/allowed.ts"],
        undefined,
        "worktrees/escaped",
      );

      expect(result.status).toBe(ResultStatus.Success);
      if (result.status === ResultStatus.Failure) return;
      expect(result.value.status).toBe(WorktreeInspectionStatus.Unavailable);
      expect(result.value.diagnostics).toEqual([
        { code: WorktreeInspectionDiagnosticCode.WorktreePathEscapesRoot },
      ]);
      expect(JSON.stringify(result.value)).not.toContain(fixture.repositoryRoot);
      expect(JSON.stringify(result.value)).not.toContain(outsideRoot);
    } finally {
      await rm(outsideRoot, { recursive: true, force: true });
    }
  });

  it("将 Git 失败和超时转换为 Unavailable 且不泄露命令输出", async () => {
    const fixture = await createFixture();
    const failed = await inspect(
      fixture,
      scriptedRunner({ exitCode: 128, stdout: "", stderr: fixture.repositoryRoot }),
    );
    const timedOut = await inspect(
      fixture,
      scriptedRunner({
        exitCode: null,
        stdout: "",
        stderr: fixture.repositoryRoot,
        launchError: "timeout",
      }),
    );

    expect(failed.status).toBe(ResultStatus.Success);
    expect(timedOut.status).toBe(ResultStatus.Success);
    if (failed.status === ResultStatus.Failure || timedOut.status === ResultStatus.Failure) return;
    expect(failed.value.status).toBe(WorktreeInspectionStatus.Unavailable);
    expect(failed.value.diagnostics[0]).toEqual({
      code: WorktreeInspectionDiagnosticCode.GitRepositoryUnavailable,
      operation: WorktreeGitOperation.ResolveWorktreeRoot,
    });
    expect(timedOut.value.diagnostics[0]).toEqual({
      code: WorktreeInspectionDiagnosticCode.GitCommandTimedOut,
      operation: WorktreeGitOperation.ResolveWorktreeRoot,
    });
    expect(JSON.stringify(failed.value)).not.toContain(fixture.repositoryRoot);
  });

  it("拒绝 Base Revision option injection 且不执行 Git", async () => {
    const fixture = await createFixture();
    let callCount = 0;
    const runner: CommandRunner = {
      run: () => {
        callCount += 1;
        return Promise.resolve(success({ exitCode: 0, stdout: "", stderr: "" }));
      },
    };
    const result = await inspect(
      fixture,
      runner,
      undefined,
      undefined,
      undefined,
      "--upload-pack=evil",
    );

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Success) return;
    expect(result.error.code).toBe(HarnessErrorCode.InvalidInput);
    expect(callCount).toBe(0);
  });
});

async function inspect(
  fixture: Fixture,
  runner: CommandRunner,
  writeSet = ["src/allowed.ts"],
  branchName = fixture.branchName,
  relativePath = fixture.relativePath,
  baseRevision = fixture.baseRevision,
): Promise<Result<WorktreeInspectionReport, HarnessError>> {
  if (repositoryId.status === ResultStatus.Failure) throw repositoryId.error;
  return new NodeWorktreeInspectorAdapter(runner).inspect({
    repositoryId: repositoryId.value,
    repositoryRoot: fixture.repositoryRoot,
    worktreeBinding: {
      worktreeId: "task-worktree",
      relativePath,
      branchName,
      managed: true,
    },
    baseRevision,
    writeSet,
  });
}

/** 集成测试使用的临时 Git Repository 和 Worktree。 */
interface Fixture {
  /** 临时 Repository Root。 */
  repositoryRoot: string;
  /** 临时 Worktree Root。 */
  worktreeRoot: string;
  /** Worktree 相对 Repository Root 的路径。 */
  relativePath: string;
  /** 绑定的 Worktree 分支。 */
  branchName: string;
  /** 初始提交的 Revision。 */
  baseRevision: string;
}

async function createFixture(): Promise<Fixture> {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "liushi-worktree-root-"));
  fixtures.push(repositoryRoot);
  await runGit(repositoryRoot, ["init", "-b", "main"]);
  await mkdir(join(repositoryRoot, "src"));
  await writeFile(join(repositoryRoot, "src", "base.ts"), "export const value = 1;\n");
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
  const relativePath = "worktrees/task";
  const branchName = "task/worktree";
  await runGit(repositoryRoot, ["worktree", "add", "-b", branchName, relativePath, baseRevision]);
  return {
    repositoryRoot,
    worktreeRoot: join(repositoryRoot, relativePath),
    relativePath,
    branchName,
    baseRevision,
  };
}

async function runGit(cwd: string, args: readonly string[]): Promise<string> {
  const result = await new NodeCommandRunnerAdapter().run({
    executable: "git",
    args,
    cwd,
    timeoutMs: 10_000,
  });
  if (result.status === ResultStatus.Failure || result.value.exitCode !== 0) {
    throw new Error("Git fixture setup failed.");
  }
  return result.value.stdout.trim();
}

function recordingRunner(calls: CommandRunRequest[]): CommandRunner {
  const runner = new NodeCommandRunnerAdapter();
  return {
    run: async (request) => {
      calls.push(request);
      return runner.run(request);
    },
  };
}

function scriptedRunner(result: CommandRunResult): CommandRunner {
  return {
    run: () => Promise.resolve(success(result)),
  };
}
