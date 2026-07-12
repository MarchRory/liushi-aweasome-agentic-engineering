import { lstat, realpath } from "node:fs/promises";
import { resolve } from "node:path";

import type { ActionExecutionResult } from "#application/actionExecution/index.js";
import type { ContentDigestPort, WorktreeInspectorPort } from "#application/ports/index.js";
import {
  WorktreeProvisionFailureCode,
  type ProvisionWorktreeExecutionInput,
  type WorktreeProvisionerPort,
} from "#application/ports/worktreeProvisioner/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  success,
  type Result,
} from "#common/index.js";
import { ActionOutcome } from "#domain/actionJournal/index.js";
import { WorktreeInspectionStatus } from "#application/ports/worktree/index.js";
import type { CommandRunner } from "#infrastructure/system/index.js";
import { isWithinRoot } from "#infrastructure/worktree/path/index.js";

import { DEFAULT_WORKTREE_PROVISION_TIMEOUT_MS } from "../constants/index.js";

/** 通过 Git CLI 创建 Managed Worktree，并用只读 Inspector 验证后置条件。 */
export class NodeWorktreeProvisionerAdapter implements WorktreeProvisionerPort {
  public constructor(
    private readonly runner: CommandRunner,
    private readonly inspector: WorktreeInspectorPort,
    private readonly digest: ContentDigestPort,
    private readonly timeoutMs = DEFAULT_WORKTREE_PROVISION_TIMEOUT_MS,
  ) {
    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
      throw new HarnessError(
        HarnessErrorCode.InvalidInput,
        "Worktree Provision timeout 必须为正整数。",
        {
          field: "timeoutMs",
        },
      );
    }
  }

  /** 创建 Worktree；任何无法证明的部分执行结果都返回 OutcomeUnknown。 */
  public async execute(
    input: ProvisionWorktreeExecutionInput,
  ): Promise<Result<ActionExecutionResult, HarnessError>> {
    const prepared = await this.prepare(input);
    if (prepared.status === ResultStatus.Failure) return prepared;
    if ("preflightFailure" in prepared.value) {
      return this.result(input, ActionOutcome.NotApplied, prepared.value.preflightFailure);
    }

    const command = await this.runner.run({
      executable: "git",
      args: [
        "worktree",
        "add",
        "-b",
        input.worktreeBinding.branchName,
        "--",
        prepared.value.targetRoot,
        prepared.value.baseCommit,
      ],
      cwd: prepared.value.repositoryRoot,
      timeoutMs: this.timeoutMs,
    });
    if (command.status === ResultStatus.Failure) return command;

    const inspection = await this.inspector.inspect({
      repositoryId: input.repositoryId,
      repositoryRoot: prepared.value.repositoryRoot,
      worktreeBinding: input.worktreeBinding,
      baseRevision: prepared.value.baseCommit,
      writeSet: input.writeSet,
    });
    if (
      inspection.status === ResultStatus.Success &&
      inspection.value.status === WorktreeInspectionStatus.Ready
    ) {
      return this.result(input, ActionOutcome.Succeeded);
    }

    const failureCode =
      command.value.launchError === "timeout"
        ? WorktreeProvisionFailureCode.GitCommandTimedOut
        : command.value.exitCode === 0
          ? WorktreeProvisionFailureCode.PostconditionFailed
          : WorktreeProvisionFailureCode.GitCommandFailed;
    const absent = await pathIsAbsent(prepared.value.targetRoot);
    const branchAbsent = await this.branchIsAbsent(
      prepared.value.repositoryRoot,
      input.worktreeBinding.branchName,
    );
    return this.result(
      input,
      absent && branchAbsent ? ActionOutcome.NotApplied : ActionOutcome.OutcomeUnknown,
      failureCode,
    );
  }

  private async prepare(
    input: ProvisionWorktreeExecutionInput,
  ): Promise<Result<PreparedWorktree, HarnessError>> {
    let repositoryRoot: string;
    try {
      repositoryRoot = await realpath(input.repositoryRoot);
      if (!(await lstat(repositoryRoot)).isDirectory()) throw new Error("not_directory");
    } catch {
      return success({ preflightFailure: WorktreeProvisionFailureCode.RepositoryUnavailable });
    }
    const targetRoot = resolve(repositoryRoot, ...input.worktreeBinding.relativePath.split("/"));
    if (!isWithinRoot(repositoryRoot, targetRoot) || targetRoot === repositoryRoot) {
      return success({ preflightFailure: WorktreeProvisionFailureCode.InvalidInput });
    }
    if (!(await pathIsAbsent(targetRoot))) {
      return success({ preflightFailure: WorktreeProvisionFailureCode.TargetAlreadyExists });
    }
    if (!(await this.branchIsAbsent(repositoryRoot, input.worktreeBinding.branchName))) {
      return success({ preflightFailure: WorktreeProvisionFailureCode.BranchAlreadyExists });
    }
    const base = await this.runner.run({
      executable: "git",
      args: ["rev-parse", "--verify", `${input.baseRevision}^{commit}`],
      cwd: repositoryRoot,
      timeoutMs: this.timeoutMs,
    });
    if (base.status === ResultStatus.Failure) return base;
    const baseCommit = base.value.stdout.trim();
    if (base.value.exitCode !== 0 || !/^[0-9a-f]{40,64}$/u.test(baseCommit)) {
      return success({ preflightFailure: WorktreeProvisionFailureCode.BaseRevisionUnavailable });
    }
    return success({ repositoryRoot, targetRoot, baseCommit });
  }

  private async branchIsAbsent(repositoryRoot: string, branchName: string): Promise<boolean> {
    const result = await this.runner.run({
      executable: "git",
      args: ["show-ref", "--verify", "--quiet", `refs/heads/${branchName}`],
      cwd: repositoryRoot,
      timeoutMs: this.timeoutMs,
    });
    return result.status === ResultStatus.Success && result.value.exitCode === 1;
  }

  private result(
    input: ProvisionWorktreeExecutionInput,
    outcome: ActionOutcome,
    errorCode?: WorktreeProvisionFailureCode,
  ): Result<ActionExecutionResult, HarnessError> {
    const outputDigest = this.digest.calculate({
      outcome,
      ...(errorCode === undefined ? {} : { errorCode }),
    });
    if (outputDigest.status === ResultStatus.Failure) return outputDigest;
    return success({
      outcome,
      evidenceIds: [input.evidenceId],
      outputDigest: outputDigest.value,
      ...(errorCode === undefined ? {} : { errorCode }),
    });
  }
}

/** Worktree 创建前置检查的闭合结果。 */
type PreparedWorktree =
  | { readonly preflightFailure: WorktreeProvisionFailureCode }
  | {
      readonly repositoryRoot: string;
      readonly targetRoot: string;
      readonly baseCommit: string;
    };

async function pathIsAbsent(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return false;
  } catch (error) {
    return isMissingPathError(error);
  }
}

function isMissingPathError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
