import {
  GitCheckpointInspectionStatus,
  WorktreeInspectionStatus,
  type ContentDigestPort,
  type GitCheckpoint,
  type GitCheckpointExecutionResult,
  type GitCheckpointInput,
  type GitCheckpointInspection,
  type GitCheckpointRecoveryPort,
  type WorktreeInspectorPort,
} from "#application/ports/index.js";
import { ResultStatus, success, type HarnessError, type Result } from "#common/index.js";
import { normalizeWriteSet } from "#domain/codingTask/index.js";
import { createSanitizedGitCommandEnvironment } from "#infrastructure/gitCommand/index.js";
import type { CommandRunner } from "#infrastructure/system/index.js";
import { resolveManagedGitWorktreeIdentity } from "#infrastructure/worktree/index.js";

import {
  createNotAppliedGitCheckpointResult,
  createSucceededGitCheckpointResult,
  createUnknownGitCheckpointResult,
  gitCheckpointUnavailable,
} from "../result/index.js";
import {
  isGitCheckpointRevision,
  isSafeGitCheckpointInput,
  sameGitCheckpointPaths,
} from "../validation/index.js";

const GIT_TIMEOUT_MS = 30_000;

/** 使用非 Shell Git 命令创建并检查单提交实现 Checkpoint。 */
export class NodeGitCheckpointAdapter implements GitCheckpointRecoveryPort {
  public constructor(
    private readonly runner: CommandRunner,
    private readonly inspector: WorktreeInspectorPort,
    private readonly digest: ContentDigestPort,
  ) {}

  /** 只提交已确认 Write Set 内的当前 Diff，并返回可恢复的 Journal 结果。 */
  public async execute(
    input: GitCheckpointInput,
  ): Promise<Result<GitCheckpointExecutionResult, HarnessError>> {
    if (!isSafeGitCheckpointInput(input)) {
      return success(createNotAppliedGitCheckpointResult("git_checkpoint_input_invalid"));
    }
    const preflight = await this.inspector.inspect(inspectInput(input));
    if (preflight.status === ResultStatus.Failure) return preflight;
    if (preflight.value.status !== WorktreeInspectionStatus.Dirty) {
      const existing = await this.inspect(input);
      if (existing.status === ResultStatus.Success) {
        return success(createSucceededGitCheckpointResult(existing.value));
      }
      return success(
        preflight.value.status === WorktreeInspectionStatus.Ready
          ? createNotAppliedGitCheckpointResult("git_checkpoint_diff_not_ready")
          : createUnknownGitCheckpointResult("git_checkpoint_preflight_unknown"),
      );
    }
    if (preflight.value.changedPaths.length === 0) {
      return success(createNotAppliedGitCheckpointResult("git_checkpoint_diff_empty"));
    }
    const worktreeRoot = await resolveWorktreeRoot(this.runner, input);
    if (worktreeRoot === undefined) {
      return success(createNotAppliedGitCheckpointResult("git_checkpoint_worktree_invalid"));
    }

    const added = await runGit(this.runner, worktreeRoot, [
      "add",
      "--",
      ...preflight.value.changedPaths,
    ]);
    if (added === undefined) {
      return success(createUnknownGitCheckpointResult("git_checkpoint_add_unknown"));
    }
    const staged = await readGit(this.runner, worktreeRoot, [
      "diff",
      "--cached",
      "--name-only",
      "--no-renames",
      "-z",
    ]);
    if (
      staged === undefined ||
      !sameGitCheckpointPaths(parsePaths(staged), preflight.value.changedPaths)
    ) {
      return success(createUnknownGitCheckpointResult("git_checkpoint_staged_diff_mismatch"));
    }
    const committed = await runGit(this.runner, worktreeRoot, [
      "commit",
      "-m",
      input.commitMessage,
    ]);
    if (committed === undefined) {
      const recovered = await this.inspect(input);
      return recovered.status === ResultStatus.Success
        ? success(createSucceededGitCheckpointResult(recovered.value))
        : success(createUnknownGitCheckpointResult("git_checkpoint_commit_unknown"));
    }
    const checkpoint = await this.inspect(input);
    if (checkpoint.status === ResultStatus.Failure) {
      return success(createUnknownGitCheckpointResult("git_checkpoint_postcondition_unknown"));
    }
    return success(createSucceededGitCheckpointResult(checkpoint.value));
  }

  /** 只读区分不存在、已存在与无法证明的 Checkpoint 状态。 */
  public async assess(
    input: GitCheckpointInput,
  ): Promise<Result<GitCheckpointInspection, HarnessError>> {
    if (!isSafeGitCheckpointInput(input)) {
      return success({ status: GitCheckpointInspectionStatus.Unknown });
    }
    const worktreeRoot = await resolveWorktreeRoot(this.runner, input);
    if (worktreeRoot === undefined) {
      return success({ status: GitCheckpointInspectionStatus.Unknown });
    }

    const existing = await this.inspectResolved(input, worktreeRoot);
    if (existing.status === ResultStatus.Success) {
      return success({
        status: GitCheckpointInspectionStatus.Present,
        checkpoint: existing.value,
      });
    }

    const preflight = await this.inspector.inspect(inspectInput(input));
    if (
      preflight.status === ResultStatus.Success &&
      (preflight.value.status === WorktreeInspectionStatus.Ready ||
        preflight.value.status === WorktreeInspectionStatus.Dirty)
    ) {
      return success({ status: GitCheckpointInspectionStatus.Absent });
    }
    return success({ status: GitCheckpointInspectionStatus.Unknown });
  }

  /** 检查当前 HEAD 是 Base 之上的唯一提交，且工作区洁净、Diff 未越界。 */
  public async inspect(input: GitCheckpointInput): Promise<Result<GitCheckpoint, HarnessError>> {
    if (!isSafeGitCheckpointInput(input)) return gitCheckpointUnavailable();
    const worktreeRoot = await resolveWorktreeRoot(this.runner, input);
    if (worktreeRoot === undefined) return gitCheckpointUnavailable();
    return this.inspectResolved(input, worktreeRoot);
  }

  private async inspectResolved(
    input: GitCheckpointInput,
    worktreeRoot: string,
  ): Promise<Result<GitCheckpoint, HarnessError>> {
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
      return gitCheckpointUnavailable();
    }
    if (!isGitCheckpointRevision(targetRevision)) return gitCheckpointUnavailable();
    const changedPaths = parsePaths(diff);
    const allowed = new Set(input.writeSet);
    if (changedPaths.length === 0 || changedPaths.some((path) => !allowed.has(path))) {
      return gitCheckpointUnavailable();
    }
    const checkpointDigest = this.digest.calculate({ targetRevision, changedPaths });
    return checkpointDigest.status === ResultStatus.Failure
      ? checkpointDigest
      : success({ targetRevision, changedPaths, checkpointDigest: checkpointDigest.value });
  }
}

async function resolveWorktreeRoot(
  runner: CommandRunner,
  input: GitCheckpointInput,
): Promise<string | undefined> {
  try {
    const resolved = await resolveManagedGitWorktreeIdentity(runner, {
      repositoryRoot: input.repositoryRoot,
      worktreeBinding: input.worktreeBinding,
    });
    return resolved.status === ResultStatus.Success ? resolved.value.worktreeRoot : undefined;
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
    environment: createSanitizedGitCommandEnvironment(),
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
    environment: createSanitizedGitCommandEnvironment(),
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
