import { lstat, realpath } from "node:fs/promises";
import { resolve } from "node:path";

import type {
  ContentDigestPort,
  GitCheckpoint,
  GitCheckpointExecutionResult,
  GitCheckpointInput,
  GitCheckpointPort,
  WorktreeInspectorPort,
} from "#application/ports/index.js";
import { WorktreeInspectionStatus } from "#application/ports/worktree/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import { ActionOutcome } from "#domain/actionJournal/index.js";
import { normalizeWriteSet } from "#domain/codingTask/index.js";
import type { CommandRunner } from "#infrastructure/system/index.js";
import { isWithinRoot, sameResolvedPath } from "#infrastructure/worktree/path/index.js";

const GIT_TIMEOUT_MS = 30_000;
const MAX_GIT_OUTPUT_BYTES = 1_048_576;

/** 使用非 Shell Git 命令创建并检查单提交实现 Checkpoint。 */
export class NodeGitCheckpointAdapter implements GitCheckpointPort {
  public constructor(
    private readonly runner: CommandRunner,
    private readonly inspector: WorktreeInspectorPort,
    private readonly digest: ContentDigestPort,
  ) {}

  /** 只提交已确认 Write Set 内的当前 Diff，并返回可恢复的 Journal 结果。 */
  public async execute(
    input: GitCheckpointInput,
  ): Promise<Result<GitCheckpointExecutionResult, HarnessError>> {
    if (!isSafeInput(input)) return success(notApplied("git_checkpoint_input_invalid"));
    const preflight = await this.inspector.inspect(inspectInput(input));
    if (preflight.status === ResultStatus.Failure) return preflight;
    if (preflight.value.status !== WorktreeInspectionStatus.Dirty) {
      const existing = await this.inspect(input);
      if (existing.status === ResultStatus.Success) return success(succeeded(existing.value));
      return success(
        preflight.value.status === WorktreeInspectionStatus.Ready
          ? notApplied("git_checkpoint_diff_not_ready")
          : unknown("git_checkpoint_preflight_unknown"),
      );
    }
    if (preflight.value.changedPaths.length === 0)
      return success(notApplied("git_checkpoint_diff_empty"));
    const worktreeRoot = await resolveWorktreeRoot(this.runner, input);
    if (worktreeRoot === undefined) return success(notApplied("git_checkpoint_worktree_invalid"));

    const added = await runGit(this.runner, worktreeRoot, [
      "add",
      "--",
      ...preflight.value.changedPaths,
    ]);
    if (added === undefined) return success(unknown("git_checkpoint_add_unknown"));
    const staged = await readGit(this.runner, worktreeRoot, [
      "diff",
      "--cached",
      "--name-only",
      "--no-renames",
      "-z",
    ]);
    if (staged === undefined || !samePaths(parsePaths(staged), preflight.value.changedPaths)) {
      return success(unknown("git_checkpoint_staged_diff_mismatch"));
    }
    const committed = await runGit(this.runner, worktreeRoot, [
      "commit",
      "-m",
      input.commitMessage,
    ]);
    if (committed === undefined) {
      const recovered = await this.inspect(input);
      return recovered.status === ResultStatus.Success
        ? success(succeeded(recovered.value))
        : success(unknown("git_checkpoint_commit_unknown"));
    }
    const checkpoint = await this.inspect(input);
    if (checkpoint.status === ResultStatus.Failure) {
      return success(unknown("git_checkpoint_postcondition_unknown"));
    }
    return success(succeeded(checkpoint.value));
  }

  /** 检查当前 HEAD 是 Base 之上的唯一提交，且工作区洁净、Diff 未越界。 */
  public async inspect(input: GitCheckpointInput): Promise<Result<GitCheckpoint, HarnessError>> {
    if (!isSafeInput(input)) return unavailable();
    const worktreeRoot = await resolveWorktreeRoot(this.runner, input);
    if (worktreeRoot === undefined) return unavailable();
    const targetRevision = await readGit(this.runner, worktreeRoot, [
      "rev-parse",
      "--verify",
      "HEAD",
    ]);
    const commitCount = await readGit(this.runner, worktreeRoot, [
      "rev-list",
      "--count",
      `${input.baseRevision}..HEAD`,
    ]);
    const branch = await readGit(this.runner, worktreeRoot, ["branch", "--show-current"]);
    const status = await readGit(this.runner, worktreeRoot, [
      "status",
      "--porcelain=v1",
      "-z",
      "--untracked-files=all",
    ]);
    const diff = await readGit(this.runner, worktreeRoot, [
      "diff",
      "--name-only",
      "--no-renames",
      "-z",
      `${input.baseRevision}..HEAD`,
    ]);
    if (
      targetRevision === undefined ||
      commitCount !== "1" ||
      branch !== input.worktreeBinding.branchName ||
      status !== "" ||
      diff === undefined
    ) {
      return unavailable();
    }
    if (!isRevision(targetRevision)) return unavailable();
    const changedPaths = parsePaths(diff);
    const allowed = new Set(input.writeSet);
    if (changedPaths.length === 0 || changedPaths.some((path) => !allowed.has(path))) {
      return unavailable();
    }
    const checkpointDigest = this.digest.calculate({ targetRevision, changedPaths });
    return checkpointDigest.status === ResultStatus.Failure
      ? checkpointDigest
      : success({ targetRevision, changedPaths, checkpointDigest: checkpointDigest.value });
  }
}

function succeeded(checkpoint: GitCheckpoint): GitCheckpointExecutionResult {
  return {
    outcome: ActionOutcome.Succeeded,
    evidenceIds: [
      `git:${checkpoint.targetRevision}`,
      ...checkpoint.changedPaths.map((path) => `file:${path}`),
    ],
    outputDigest: checkpoint.checkpointDigest,
  };
}

async function resolveWorktreeRoot(
  runner: CommandRunner,
  input: GitCheckpointInput,
): Promise<string | undefined> {
  try {
    if (!input.worktreeBinding.managed) return undefined;
    const repositoryRoot = await realpath(input.repositoryRoot);
    const repositoryTopLevel = await readGit(runner, repositoryRoot, [
      "rev-parse",
      "--show-toplevel",
    ]);
    const expectedCommonDirectory = await readGit(runner, repositoryRoot, [
      "rev-parse",
      "--path-format=absolute",
      "--git-common-dir",
    ]);
    if (repositoryTopLevel === undefined || expectedCommonDirectory === undefined) return undefined;
    const actualRepositoryTopLevel = await realpath(repositoryTopLevel);
    const canonicalExpectedCommonDirectory = await realpath(expectedCommonDirectory);
    if (!sameResolvedPath(actualRepositoryTopLevel, repositoryRoot)) return undefined;
    const candidate = resolve(repositoryRoot, ...input.worktreeBinding.relativePath.split("/"));
    if (!isWithinRoot(repositoryRoot, candidate)) return undefined;
    const actual = await realpath(candidate);
    if (!(await lstat(actual)).isDirectory() || !isWithinRoot(repositoryRoot, actual)) {
      return undefined;
    }
    const actualCommonDirectory = await readGit(runner, actual, [
      "rev-parse",
      "--path-format=absolute",
      "--git-common-dir",
    ]);
    if (actualCommonDirectory === undefined) return undefined;
    return sameResolvedPath(await realpath(actualCommonDirectory), canonicalExpectedCommonDirectory)
      ? actual
      : undefined;
  } catch {
    return undefined;
  }
}

async function runGit(
  runner: CommandRunner,
  cwd: string,
  args: readonly string[],
): Promise<boolean | undefined> {
  const result = await runner.run({
    executable: "git",
    args,
    cwd,
    timeoutMs: GIT_TIMEOUT_MS,
    maxOutputBytes: MAX_GIT_OUTPUT_BYTES,
  });
  return result.status === ResultStatus.Success &&
    result.value.exitCode === 0 &&
    result.value.launchError === undefined
    ? true
    : undefined;
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
    timeoutMs: GIT_TIMEOUT_MS,
    maxOutputBytes: MAX_GIT_OUTPUT_BYTES,
  });
  return result.status === ResultStatus.Success &&
    result.value.exitCode === 0 &&
    result.value.launchError === undefined
    ? result.value.stdout.trim()
    : undefined;
}

function parsePaths(output: string): readonly string[] {
  try {
    return normalizeWriteSet(output.split("\0").filter(Boolean));
  } catch {
    return [];
  }
}

function inspectInput(input: GitCheckpointInput) {
  return {
    repositoryId: input.repositoryId,
    repositoryRoot: input.repositoryRoot,
    worktreeBinding: input.worktreeBinding,
    baseRevision: input.baseRevision,
    writeSet: input.writeSet,
  };
}

function samePaths(actual: readonly string[], expected: readonly string[]): boolean {
  return (
    actual.length === expected.length && actual.every((path, index) => path === expected[index])
  );
}

function isSafeInput(input: GitCheckpointInput): boolean {
  if (
    !input.worktreeBinding.managed ||
    !isSafeRevision(input.baseRevision) ||
    input.commitMessage.length === 0 ||
    input.commitMessage.trim() !== input.commitMessage ||
    /[\u0000-\u001f\u007f]/u.test(input.commitMessage)
  ) {
    return false;
  }
  try {
    return samePaths(normalizeWriteSet(input.writeSet), input.writeSet);
  } catch {
    return false;
  }
}

function isSafeRevision(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= 512 &&
    value.trim() === value &&
    !value.startsWith("-") &&
    !/[\u0000-\u0020\u007f]/u.test(value)
  );
}

function isRevision(value: string): boolean {
  return /^[0-9a-f]{40,128}$/iu.test(value);
}

function notApplied(errorCode: string): GitCheckpointExecutionResult {
  return { outcome: ActionOutcome.NotApplied, evidenceIds: [], errorCode };
}

function unknown(errorCode: string): GitCheckpointExecutionResult {
  return { outcome: ActionOutcome.OutcomeUnknown, evidenceIds: [], errorCode };
}

function unavailable(): Result<never, HarnessError> {
  return failure(
    new HarnessError(HarnessErrorCode.InvalidStateTransition, "Git Checkpoint 后置条件不满足。"),
  );
}
