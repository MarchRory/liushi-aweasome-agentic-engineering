import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import { ResultStatus } from "../../src/common/index.js";
import { NodeCommandRunnerAdapter } from "../../src/infrastructure/system/index.js";
import { resolveManagedGitWorktreeIdentity } from "../../src/infrastructure/worktree/index.js";

const fixtureRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    fixtureRoots.splice(0).map((fixtureRoot) => rm(fixtureRoot, { recursive: true, force: true })),
  );
});

describe("Managed Git Worktree Identity Guard", () => {
  it("忽略宿主注入的 GIT_DIR 与 GIT_WORK_TREE", async () => {
    const repositoryRoot = await createRepository();
    const baseRevision = await runGit(repositoryRoot, ["rev-parse", "HEAD"]);
    await runGit(repositoryRoot, [
      "worktree",
      "add",
      "-b",
      "feature/environment",
      "worktrees/environment",
      baseRevision,
    ]);
    const previousGitDirectory = process.env["GIT_DIR"];
    const previousGitWorktree = process.env["GIT_WORK_TREE"];
    process.env["GIT_DIR"] = join(repositoryRoot, ".git");
    process.env["GIT_WORK_TREE"] = repositoryRoot;
    try {
      const result = await resolveManagedGitWorktreeIdentity(new NodeCommandRunnerAdapter(), {
        repositoryRoot,
        worktreeBinding: {
          worktreeId: "environment",
          relativePath: "worktrees/environment",
          branchName: "feature/environment",
          managed: true,
        },
      });
      expect(result.status).toBe(ResultStatus.Success);
    } finally {
      restoreEnvironment("GIT_DIR", previousGitDirectory);
      restoreEnvironment("GIT_WORK_TREE", previousGitWorktree);
    }
  });

  it("接受同一 Common Directory 的受管 Worktree，并拒绝嵌套仓库替换", async () => {
    const repositoryRoot = await createRepository();
    const runner = new NodeCommandRunnerAdapter();
    const baseRevision = await runGit(repositoryRoot, ["rev-parse", "HEAD"]);
    await runGit(repositoryRoot, [
      "worktree",
      "add",
      "-b",
      "feature/managed",
      "worktrees/managed",
      baseRevision,
    ]);

    const managed = await resolveManagedGitWorktreeIdentity(runner, {
      repositoryRoot,
      worktreeBinding: {
        worktreeId: "managed",
        relativePath: "worktrees/managed",
        branchName: "feature/managed",
        managed: true,
      },
    });
    expect(managed.status).toBe(ResultStatus.Success);

    const nestedRoot = join(repositoryRoot, "nested-repository");
    await mkdir(nestedRoot);
    await runGit(nestedRoot, ["init", "-b", "feature/nested"]);
    const replaced = await resolveManagedGitWorktreeIdentity(runner, {
      repositoryRoot,
      worktreeBinding: {
        worktreeId: "nested",
        relativePath: "nested-repository",
        branchName: "feature/nested",
        managed: true,
      },
    });
    expect(replaced.status).toBe(ResultStatus.Failure);
  });
});

async function createRepository(): Promise<string> {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "liushi-worktree-identity-"));
  fixtureRoots.push(repositoryRoot);
  await runGit(repositoryRoot, ["init", "-b", "main"]);
  await runGit(repositoryRoot, ["config", "user.name", "liushi-test"]);
  await runGit(repositoryRoot, ["config", "user.email", "liushi-test@example.com"]);
  await writeFile(join(repositoryRoot, "README.md"), "# fixture\n");
  await runGit(repositoryRoot, ["add", "README.md"]);
  await runGit(repositoryRoot, ["commit", "-m", "base"]);
  return repositoryRoot;
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

function restoreEnvironment(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
