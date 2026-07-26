import { realpath } from "node:fs/promises";

import type { WorktreeBinding } from "#domain/codingTask/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import type { CommandRunner } from "#infrastructure/system/index.js";
import { createSanitizedGitCommandEnvironment } from "#infrastructure/gitCommand/index.js";

import { resolveWorktreePath, sameResolvedPath, type WorktreePathContext } from "../path/index.js";

const GIT_IDENTITY_TIMEOUT_MS = 30_000;

/** Managed Git Worktree 身份检查的运行时输入。 */
export interface ManagedGitWorktreeIdentityInput {
  /** 启动期可信 Repository Root。 */
  readonly repositoryRoot: string;
  /** 已绑定的受管 Worktree。 */
  readonly worktreeBinding: WorktreeBinding;
}

/** 验证 Worktree 路径、Repository Top-Level 与 Git Common Directory 属于同一仓库。 */
export async function resolveManagedGitWorktreeIdentity(
  runner: CommandRunner,
  input: ManagedGitWorktreeIdentityInput,
): Promise<Result<WorktreePathContext, HarnessError>> {
  if (!input.worktreeBinding.managed) return failure(identityUnavailable());

  const pathContext = await resolveWorktreePath(
    input.repositoryRoot,
    input.worktreeBinding.relativePath,
  );
  if (pathContext.status === ResultStatus.Failure) return failure(identityUnavailable());

  try {
    const repositoryTopLevel = await readGit(runner, pathContext.value.repositoryRoot, [
      "rev-parse",
      "--show-toplevel",
    ]);
    const expectedCommonDirectory = await readGit(runner, pathContext.value.repositoryRoot, [
      "rev-parse",
      "--path-format=absolute",
      "--git-common-dir",
    ]);
    const actualCommonDirectory = await readGit(runner, pathContext.value.worktreeRoot, [
      "rev-parse",
      "--path-format=absolute",
      "--git-common-dir",
    ]);
    const actualWorktreeTopLevel = await readGit(runner, pathContext.value.worktreeRoot, [
      "rev-parse",
      "--show-toplevel",
    ]);
    if (
      repositoryTopLevel === undefined ||
      expectedCommonDirectory === undefined ||
      actualCommonDirectory === undefined ||
      actualWorktreeTopLevel === undefined
    ) {
      return failure(identityUnavailable());
    }

    const actualRepositoryTopLevel = await realpath(repositoryTopLevel);
    const canonicalExpectedCommonDirectory = await realpath(expectedCommonDirectory);
    const canonicalActualCommonDirectory = await realpath(actualCommonDirectory);
    const canonicalActualWorktreeTopLevel = await realpath(actualWorktreeTopLevel);
    if (
      !sameResolvedPath(actualRepositoryTopLevel, pathContext.value.repositoryRoot) ||
      !sameResolvedPath(canonicalActualCommonDirectory, canonicalExpectedCommonDirectory) ||
      !sameResolvedPath(canonicalActualWorktreeTopLevel, pathContext.value.worktreeRoot)
    ) {
      return failure(identityUnavailable());
    }
    return success(pathContext.value);
  } catch {
    return failure(identityUnavailable());
  }
}

async function readGit(
  runner: CommandRunner,
  cwd: string,
  args: readonly string[],
): Promise<string | undefined> {
  const result = await runner.run({
    executable: "git",
    args,
    cwd,
    timeoutMs: GIT_IDENTITY_TIMEOUT_MS,
    environment: createSanitizedGitCommandEnvironment(),
  });
  return result.status === ResultStatus.Success &&
    result.value.exitCode === 0 &&
    result.value.launchError === undefined
    ? result.value.stdout.trim()
    : undefined;
}

function identityUnavailable(): HarnessError {
  return new HarnessError(
    HarnessErrorCode.PreconditionNotMet,
    "Managed Git Worktree 身份无法形成权威结果。",
  );
}
