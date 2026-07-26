import { ResultStatus, failure, success, type Result } from "#common/index.js";
import {
  WorktreeInspectionDiagnosticCode,
  WorktreeGitOperation,
  type WorktreeChange,
} from "#application/ports/worktree/index.js";
import { createSanitizedGitCommandEnvironment } from "#infrastructure/gitCommand/index.js";
import type { CommandRunResult, CommandRunner } from "#infrastructure/system/index.js";

import { parseWorktreeStatus } from "../status/index.js";

/** Git Worktree 只读读取所需的运行时参数。 */
export interface GitWorktreeReadInput {
  /** 已解析且通过 containment 检查的 Worktree Root。 */
  cwd: string;
  /** 已通过参数安全校验的 Base Revision。 */
  baseRevision: string;
  /** 每条 Git 命令的超时毫秒数。 */
  timeoutMs: number;
}

/** Git 只读读取成功后供 Adapter 使用的内部快照。 */
export interface GitWorktreeState {
  /** Git `show-toplevel` 返回的真实 Worktree Root。 */
  actualRoot: string;
  /** Git 当前分支；Detached HEAD 时为空字符串。 */
  actualBranchName: string;
  /** Git 当前 HEAD Revision。 */
  actualHeadRevision: string;
  /** Git 解析后的 Base Commit Revision。 */
  resolvedBaseRevision: string;
  /** Git porcelain 状态解析后的变化集合。 */
  changes: readonly WorktreeChange[];
}

/** Git 读取失败时不包含运行时路径或命令输出的稳定结果。 */
export interface GitWorktreeReadFailure {
  /** 失败的稳定诊断分类。 */
  code: WorktreeInspectionDiagnosticCode;
  /** 失败对应的 Git 操作。 */
  operation: WorktreeGitOperation;
}

/** 通过 shell=false 的 CommandRunner 读取 Git Worktree 状态。 */
export async function readGitWorktreeState(
  runner: CommandRunner,
  input: GitWorktreeReadInput,
): Promise<Result<GitWorktreeState, GitWorktreeReadFailure>> {
  const root = await runGit(runner, input, WorktreeGitOperation.ResolveWorktreeRoot, [
    "rev-parse",
    "--show-toplevel",
  ]);
  if (root.status === ResultStatus.Failure) return root;
  const actualRoot = parseSingleValue(root.value.stdout, false);
  if (actualRoot === undefined) {
    return failure({
      code: WorktreeInspectionDiagnosticCode.GitOutputInvalid,
      operation: WorktreeGitOperation.ResolveWorktreeRoot,
    });
  }

  const branch = await runGit(runner, input, WorktreeGitOperation.ResolveBranch, [
    "branch",
    "--show-current",
  ]);
  if (branch.status === ResultStatus.Failure) return branch;
  const actualBranchName = parseSingleValue(branch.value.stdout, true);
  if (actualBranchName === undefined) {
    return failure({
      code: WorktreeInspectionDiagnosticCode.GitOutputInvalid,
      operation: WorktreeGitOperation.ResolveBranch,
    });
  }

  const head = await runGit(runner, input, WorktreeGitOperation.ResolveHeadRevision, [
    "rev-parse",
    "--verify",
    "--quiet",
    "HEAD",
  ]);
  if (head.status === ResultStatus.Failure) return head;
  const actualHeadRevision = parseRevisionValue(head.value.stdout);
  if (actualHeadRevision === undefined) {
    return failure({
      code: WorktreeInspectionDiagnosticCode.GitOutputInvalid,
      operation: WorktreeGitOperation.ResolveHeadRevision,
    });
  }

  const base = await runGit(runner, input, WorktreeGitOperation.ResolveBaseRevision, [
    "rev-parse",
    "--verify",
    "--quiet",
    "--end-of-options",
    `${input.baseRevision}^{commit}`,
  ]);
  if (base.status === ResultStatus.Failure) return base;
  const resolvedBaseRevision = parseRevisionValue(base.value.stdout);
  if (resolvedBaseRevision === undefined) {
    return failure({
      code: WorktreeInspectionDiagnosticCode.GitOutputInvalid,
      operation: WorktreeGitOperation.ResolveBaseRevision,
    });
  }

  const status = await runGit(runner, input, WorktreeGitOperation.ReadStatus, [
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all",
  ]);
  if (status.status === ResultStatus.Failure) return status;
  const changes = parseWorktreeStatus(status.value.stdout);
  if (changes.status === ResultStatus.Failure) {
    return failure({
      code: WorktreeInspectionDiagnosticCode.GitOutputInvalid,
      operation: WorktreeGitOperation.ReadStatus,
    });
  }

  return success({
    actualRoot,
    actualBranchName,
    actualHeadRevision,
    resolvedBaseRevision,
    changes: changes.value,
  });
}

async function runGit(
  runner: CommandRunner,
  input: GitWorktreeReadInput,
  operation: WorktreeGitOperation,
  args: readonly string[],
): Promise<Result<CommandRunResult, GitWorktreeReadFailure>> {
  const result = await runner.run({
    executable: "git",
    args,
    cwd: input.cwd,
    timeoutMs: input.timeoutMs,
    environment: createSanitizedGitCommandEnvironment(),
  });
  if (result.status === ResultStatus.Failure) {
    return failure({ code: WorktreeInspectionDiagnosticCode.GitCommandFailed, operation });
  }

  if (result.value.launchError === "timeout") {
    return failure({ code: WorktreeInspectionDiagnosticCode.GitCommandTimedOut, operation });
  }
  if (result.value.exitCode !== 0) {
    return failure({
      code:
        operation === WorktreeGitOperation.ResolveWorktreeRoot
          ? WorktreeInspectionDiagnosticCode.GitRepositoryUnavailable
          : WorktreeInspectionDiagnosticCode.GitCommandFailed,
      operation,
    });
  }
  return success(result.value);
}

function parseSingleValue(output: string, allowEmpty: boolean): string | undefined {
  const withoutTerminator = output.endsWith("\r\n")
    ? output.slice(0, -2)
    : output.endsWith("\n")
      ? output.slice(0, -1)
      : output;
  if (
    withoutTerminator.includes("\n") ||
    withoutTerminator.includes("\r") ||
    withoutTerminator.includes("\u0000")
  ) {
    return undefined;
  }
  if (!allowEmpty && withoutTerminator.length === 0) {
    return undefined;
  }
  if (withoutTerminator.trim() !== withoutTerminator) {
    return undefined;
  }
  return withoutTerminator;
}

function parseRevisionValue(output: string): string | undefined {
  const value = parseSingleValue(output, false);
  return value !== undefined && /^[0-9a-f]{40,128}$/iu.test(value) ? value : undefined;
}
