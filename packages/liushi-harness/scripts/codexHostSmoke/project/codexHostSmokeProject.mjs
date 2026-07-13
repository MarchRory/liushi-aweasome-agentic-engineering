import { relative } from "node:path";

import { runProcess } from "../../common/process/index.mjs";
import { PUBLIC_REPOSITORY_REVISION } from "../../publicProjectSmoke/constants/index.mjs";

export function createCodexHostSmokeWorktree(repositoryRoot, worktreeRoot) {
  assertSeparateWorktree(repositoryRoot, worktreeRoot);
  runGit(repositoryRoot, ["worktree", "add", "--detach", worktreeRoot, PUBLIC_REPOSITORY_REVISION]);
  const headRevision = runGit(worktreeRoot, ["rev-parse", "HEAD"]);
  const status = runGit(worktreeRoot, ["status", "--porcelain"]);
  if (headRevision !== PUBLIC_REPOSITORY_REVISION || status.length !== 0) {
    throw new Error("Codex Host Smoke Worktree 未保持固定 Revision 或洁净状态。");
  }
  return { headRevision, clean: true, detached: true };
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
