import {
  WorktreeInspectionStatus,
  WorktreeProvisionRecoveryDiagnosticCode,
  WorktreeProvisionRecoveryInspectionStatus,
  type InspectWorktreeProvisionRecoveryInput,
  type WorktreeInspectorPort,
  type WorktreeProvisionRecoveryInspectionReport,
  type WorktreeProvisionRecoveryInspectorPort,
} from "#application/ports/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  success,
  type Result,
} from "#common/index.js";
import { createSanitizedGitCommandEnvironment } from "#infrastructure/gitCommand/index.js";
import type { CommandRunner } from "#infrastructure/system/index.js";
import { sameResolvedPath } from "#infrastructure/worktree/path/index.js";

import { DEFAULT_WORKTREE_PROVISION_RECOVERY_TIMEOUT_MS } from "../constants/index.js";
import { resolveWorktreeProvisionRecoveryPath } from "../path/index.js";
import { parseGitWorktreePorcelainZ, type GitWorktreeRegistryEntry } from "../registry/index.js";
import { validateWorktreeProvisionRecoveryInput } from "../validation/index.js";

/** 使用 shell=false Git 命令和既有 Inspector 的只读恢复检查 Adapter。 */
export class NodeWorktreeProvisionRecoveryInspectorAdapter implements WorktreeProvisionRecoveryInspectorPort {
  private readonly timeoutMs: number;

  public constructor(
    private readonly runner: CommandRunner,
    private readonly worktreeInspector: WorktreeInspectorPort,
    timeoutMs = DEFAULT_WORKTREE_PROVISION_RECOVERY_TIMEOUT_MS,
  ) {
    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
      throw new HarnessError(HarnessErrorCode.InvalidInput, "恢复检查超时时间必须为正整数。", {
        field: "timeoutMs",
      });
    }
    this.timeoutMs = timeoutMs;
  }

  public async inspect(
    input: InspectWorktreeProvisionRecoveryInput,
  ): Promise<Result<WorktreeProvisionRecoveryInspectionReport, HarnessError>> {
    const validated = validateWorktreeProvisionRecoveryInput(input);
    if (validated.status === ResultStatus.Failure) return validated;
    const base = {
      repositoryId: validated.value.repositoryId,
      worktreeId: validated.value.worktreeBinding.worktreeId,
    };

    const path = await resolveWorktreeProvisionRecoveryPath(
      validated.value.repositoryRoot,
      validated.value.worktreeBinding.relativePath,
    );
    if (path.status === ResultStatus.Failure) {
      return success({
        ...base,
        status:
          path.error === WorktreeProvisionRecoveryDiagnosticCode.RepositoryRootUnavailable
            ? WorktreeProvisionRecoveryInspectionStatus.Unavailable
            : WorktreeProvisionRecoveryInspectionStatus.HumanRequired,
        diagnostics: [path.error],
      });
    }

    const registry = await this.readRegistry(path.value.repositoryRoot);
    if (registry.status === ResultStatus.Failure) {
      return success({
        ...base,
        status: WorktreeProvisionRecoveryInspectionStatus.Unavailable,
        diagnostics: [registry.error],
      });
    }
    const branch = await this.readBranch(
      path.value.repositoryRoot,
      validated.value.worktreeBinding.branchName,
    );
    if (branch.status === ResultStatus.Failure) {
      return success({
        ...base,
        status: WorktreeProvisionRecoveryInspectionStatus.Unavailable,
        diagnostics: [branch.error],
      });
    }

    const registryState = classifyRegistry(
      registry.value,
      path.value.targetPath,
      validated.value.worktreeBinding.branchName,
    );
    const diagnostics: WorktreeProvisionRecoveryDiagnosticCode[] = [
      path.value.exists
        ? WorktreeProvisionRecoveryDiagnosticCode.TargetPathPresent
        : WorktreeProvisionRecoveryDiagnosticCode.TargetPathAbsent,
      registryState.diagnostic,
      branch.value
        ? WorktreeProvisionRecoveryDiagnosticCode.BranchPresent
        : WorktreeProvisionRecoveryDiagnosticCode.BranchAbsent,
    ];

    if (!path.value.exists && registryState.absent && !branch.value) {
      return success({
        ...base,
        status: WorktreeProvisionRecoveryInspectionStatus.NotApplied,
        diagnostics,
      });
    }
    if (!path.value.exists || !registryState.exact || !branch.value) {
      if (registryState.exact !== branch.value) {
        diagnostics.push(WorktreeProvisionRecoveryDiagnosticCode.BranchConflict);
      }
      return success({
        ...base,
        status: WorktreeProvisionRecoveryInspectionStatus.HumanRequired,
        diagnostics,
      });
    }

    const inspected = await this.worktreeInspector.inspect(validated.value);
    if (inspected.status === ResultStatus.Failure) {
      return success({
        ...base,
        status: WorktreeProvisionRecoveryInspectionStatus.Unavailable,
        diagnostics: [...diagnostics, WorktreeProvisionRecoveryDiagnosticCode.InspectorUnavailable],
      });
    }
    const inspectorDiagnostic = mapInspectorStatus(inspected.value.status);
    return success({
      ...base,
      status: inspectorDiagnostic.status,
      diagnostics: [...diagnostics, inspectorDiagnostic.code],
    });
  }

  private async readRegistry(repositoryRoot: string) {
    const result = await this.runner.run({
      executable: "git",
      args: ["worktree", "list", "--porcelain", "-z"],
      cwd: repositoryRoot,
      timeoutMs: this.timeoutMs,
      environment: createSanitizedGitCommandEnvironment(),
    });
    if (result.status === ResultStatus.Failure || result.value.exitCode !== 0) {
      return failureCode(WorktreeProvisionRecoveryDiagnosticCode.RegistryCommandUnavailable);
    }
    return parseGitWorktreePorcelainZ(result.value.stdout);
  }

  private async readBranch(repositoryRoot: string, branchName: string) {
    const result = await this.runner.run({
      executable: "git",
      args: ["show-ref", "--verify", "--quiet", `refs/heads/${branchName}`],
      cwd: repositoryRoot,
      timeoutMs: this.timeoutMs,
      environment: createSanitizedGitCommandEnvironment(),
    });
    if (result.status === ResultStatus.Failure) {
      return failureCode(WorktreeProvisionRecoveryDiagnosticCode.BranchCommandUnavailable);
    }
    if (result.value.exitCode === 0) return success(true);
    if (result.value.exitCode === 1) return success(false);
    return failureCode(WorktreeProvisionRecoveryDiagnosticCode.BranchCommandUnavailable);
  }
}

/** Adapter 内部使用的 Registry 分类。 */
interface RegistryClassification {
  readonly exact: boolean;
  readonly absent: boolean;
  readonly diagnostic: WorktreeProvisionRecoveryDiagnosticCode;
}

function classifyRegistry(
  entries: readonly GitWorktreeRegistryEntry[],
  targetPath: string,
  branchName: string,
): RegistryClassification {
  const targetEntries = entries.filter((entry) => sameResolvedPath(entry.worktreePath, targetPath));
  const branchEntries = entries.filter((entry) => entry.branchName === branchName);
  const exact =
    targetEntries.length === 1 &&
    targetEntries[0]?.branchName === branchName &&
    branchEntries.length === 1;
  if (exact) {
    return {
      exact: true,
      absent: false,
      diagnostic: WorktreeProvisionRecoveryDiagnosticCode.RegistryEntryExact,
    };
  }
  if (targetEntries.length === 0 && branchEntries.length === 0) {
    return {
      exact: false,
      absent: true,
      diagnostic: WorktreeProvisionRecoveryDiagnosticCode.RegistryEntryAbsent,
    };
  }
  return {
    exact: false,
    absent: false,
    diagnostic: WorktreeProvisionRecoveryDiagnosticCode.RegistryConflict,
  };
}

function mapInspectorStatus(status: WorktreeInspectionStatus): {
  readonly status: WorktreeProvisionRecoveryInspectionStatus;
  readonly code: WorktreeProvisionRecoveryDiagnosticCode;
} {
  switch (status) {
    case WorktreeInspectionStatus.Ready:
      return {
        status: WorktreeProvisionRecoveryInspectionStatus.Applied,
        code: WorktreeProvisionRecoveryDiagnosticCode.InspectorReady,
      };
    case WorktreeInspectionStatus.Dirty:
      return {
        status: WorktreeProvisionRecoveryInspectionStatus.HumanRequired,
        code: WorktreeProvisionRecoveryDiagnosticCode.InspectorDirty,
      };
    case WorktreeInspectionStatus.BaseRevisionDrift:
    case WorktreeInspectionStatus.BranchMismatch:
    case WorktreeInspectionStatus.WriteSetViolation:
      return {
        status: WorktreeProvisionRecoveryInspectionStatus.HumanRequired,
        code: WorktreeProvisionRecoveryDiagnosticCode.InspectorMismatch,
      };
    case WorktreeInspectionStatus.Unavailable:
      return {
        status: WorktreeProvisionRecoveryInspectionStatus.Unavailable,
        code: WorktreeProvisionRecoveryDiagnosticCode.InspectorUnavailable,
      };
  }
}

function failureCode<TCode extends WorktreeProvisionRecoveryDiagnosticCode>(code: TCode) {
  return { status: ResultStatus.Failure as const, error: code };
}
