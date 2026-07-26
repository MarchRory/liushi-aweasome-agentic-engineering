import { ResultStatus } from "#common/index.js";
import { VerificationFailureKind } from "#domain/verification/index.js";
import { createSanitizedGitCommandEnvironment } from "#infrastructure/gitCommand/index.js";
import type { CommandRunner } from "#infrastructure/system/index.js";
import { sameResolvedPath } from "#infrastructure/worktree/path/index.js";

const MAX_GIT_OUTPUT_BYTES = 65_536;

/** 校验命令运行前的仓库、分支和版本绑定。 */
export async function verifyRevisionBinding(
  runner: CommandRunner,
  root: string,
  base: string,
  target: string,
  branch: string,
  timeoutMs: number,
): Promise<VerificationFailureKind | undefined> {
  const actualRoot = await readGit(runner, root, ["rev-parse", "--show-toplevel"], timeoutMs);
  const head = await readGit(runner, root, ["rev-parse", "--verify", "HEAD"], timeoutMs);
  if (actualRoot === undefined || head === undefined || !sameResolvedPath(actualRoot, root))
    return VerificationFailureKind.WorktreeUnavailable;
  const targetCommit = await readGit(
    runner,
    root,
    ["rev-parse", "--verify", `${target}^{commit}`],
    timeoutMs,
  );
  const baseCommit = await readGit(
    runner,
    root,
    ["rev-parse", "--verify", `${base}^{commit}`],
    timeoutMs,
  );
  if (targetCommit === undefined || baseCommit === undefined || head !== targetCommit)
    return VerificationFailureKind.RevisionMismatch;
  const status = await readGit(
    runner,
    root,
    ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
    timeoutMs,
  );
  const actualBranch = await readGit(runner, root, ["branch", "--show-current"], timeoutMs);
  if (status === undefined || actualBranch === undefined)
    return VerificationFailureKind.WorktreeUnavailable;
  if (status !== "") return VerificationFailureKind.WorktreeDirty;
  if (actualBranch !== branch) return VerificationFailureKind.BranchMismatch;
  return (await runGit(
    runner,
    root,
    ["merge-base", "--is-ancestor", baseCommit, targetCommit],
    timeoutMs,
  ))
    ? undefined
    : VerificationFailureKind.RevisionMismatch;
}

/** 校验命令执行后目标版本和工作区内容没有变化。 */
export async function verifyWorktreeStability(
  runner: CommandRunner,
  root: string,
  target: string,
  timeoutMs: number,
): Promise<VerificationFailureKind | undefined> {
  const head = await readGit(runner, root, ["rev-parse", "--verify", "HEAD"], timeoutMs);
  const status = await readGit(
    runner,
    root,
    ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
    timeoutMs,
  );
  if (head === undefined || status === undefined)
    return VerificationFailureKind.WorktreeUnavailable;
  const targetCommit = await readGit(
    runner,
    root,
    ["rev-parse", "--verify", `${target}^{commit}`],
    timeoutMs,
  );
  if (targetCommit === undefined) return VerificationFailureKind.RevisionMismatch;
  return head === targetCommit && status === ""
    ? undefined
    : VerificationFailureKind.WorktreeModified;
}

async function runGit(
  runner: CommandRunner,
  cwd: string,
  args: readonly string[],
  timeoutMs: number,
): Promise<boolean> {
  const result = await runner.run({
    executable: "git",
    args,
    cwd,
    timeoutMs,
    maxOutputBytes: MAX_GIT_OUTPUT_BYTES,
    environment: createSanitizedGitCommandEnvironment(),
  });
  return (
    result.status === ResultStatus.Success &&
    result.value.exitCode === 0 &&
    result.value.launchError === undefined
  );
}

async function readGit(
  runner: CommandRunner,
  cwd: string,
  args: readonly string[],
  timeoutMs: number,
): Promise<string | undefined> {
  const result = await runner.run({
    executable: "git",
    args,
    cwd,
    timeoutMs,
    maxOutputBytes: MAX_GIT_OUTPUT_BYTES,
    environment: createSanitizedGitCommandEnvironment(),
  });
  return result.status === ResultStatus.Success &&
    result.value.exitCode === 0 &&
    result.value.launchError === undefined
    ? result.value.stdout.trim()
    : undefined;
}
