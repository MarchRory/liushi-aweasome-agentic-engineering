import { lstatSync } from "node:fs";
import { dirname, join, relative } from "node:path";

import { runProcess } from "../../common/process/index.mjs";
import { PUBLIC_REPOSITORY_REVISION } from "../../publicProjectSmoke/constants/index.mjs";

export function createCodexHostSmokeWorktree(
  repositoryRoot,
  worktreeRoot,
  revision = PUBLIC_REPOSITORY_REVISION,
) {
  assertSeparateWorktree(repositoryRoot, worktreeRoot);
  runProcess("git", ["clone", "--no-hardlinks", "--no-checkout", repositoryRoot, worktreeRoot], {
    cwd: dirname(worktreeRoot),
    timeout: 60_000,
    maxBuffer: 1024 * 1024,
  });
  runGit(worktreeRoot, ["config", "core.autocrlf", "false"]);
  runGit(worktreeRoot, ["checkout", "--detach", revision]);
  const headRevision = runGit(worktreeRoot, ["rev-parse", "HEAD"]);
  const status = runGit(worktreeRoot, ["status", "--porcelain"]);
  const gitEntry = lstatSync(join(worktreeRoot, ".git"));
  if (
    headRevision !== revision ||
    status.length !== 0 ||
    !gitEntry.isDirectory() ||
    gitEntry.isSymbolicLink()
  ) {
    throw new Error("Codex Host Smoke Worktree 未保持普通 Clone、固定 Revision 或洁净状态。");
  }
  return { headRevision, clean: true, detached: true, gitEntryKind: "directory" };
}

function assertSeparateWorktree(repositoryRoot, worktreeRoot) {
  const relation = relative(repositoryRoot, worktreeRoot);
  if (relation.length === 0 || (!relation.startsWith("..") && relation !== "..")) {
    throw new Error("Codex Host Smoke Worktree 不能位于 Source Repository 内部。");
  }
}

function runGit(cwd, args) {
  return runProcess("git", args, { cwd, timeout: 60_000, maxBuffer: 1024 * 1024 }).stdout.trim();
}
