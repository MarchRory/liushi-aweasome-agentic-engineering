import { realpath } from "node:fs/promises";

import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  success,
  type Result,
} from "#common/index.js";
import {
  WorktreeInspectionDiagnosticCode,
  WorktreeInspectionStatus,
  WorktreeGitOperation,
  type InspectWorktreeInput,
  type WorktreeChange,
  type WorktreeInspectionDiagnostic,
  type WorktreeInspectionReport,
  type WorktreeInspectorPort,
} from "#application/ports/worktree/index.js";
import type { CommandRunner } from "#infrastructure/system/index.js";
import type { ValidatedWorktreeInspectionInput } from "../validation/index.js";

import { DEFAULT_WORKTREE_INSPECTION_TIMEOUT_MS } from "../constants/index.js";
import { readGitWorktreeState, type GitWorktreeReadFailure } from "../git/index.js";
import { resolveWorktreePath, sameResolvedPath } from "../path/index.js";
import { validateWorktreeInspectionInput } from "../validation/index.js";

/** 基于 Node 文件系统和 shell=false CommandRunner 的只读 Worktree Inspector。 */
export class NodeWorktreeInspectorAdapter implements WorktreeInspectorPort {
  private readonly timeoutMs: number;

  public constructor(
    private readonly runner: CommandRunner,
    timeoutMs = DEFAULT_WORKTREE_INSPECTION_TIMEOUT_MS,
  ) {
    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
      throw new HarnessError(
        HarnessErrorCode.InvalidInput,
        "Worktree Inspector timeout must be a positive integer.",
        { field: "timeoutMs" },
      );
    }
    this.timeoutMs = timeoutMs;
  }

  /** 检查 Worktree、Git 基线和 Write Set，不执行任何文件或 Git 写操作。 */
  public async inspect(
    input: InspectWorktreeInput,
  ): Promise<Result<WorktreeInspectionReport, HarnessError>> {
    const validation = validateWorktreeInspectionInput(input);
    if (validation.status === ResultStatus.Failure) {
      return validation;
    }

    const validated = validation.value;
    const unavailableBase = createBaseReport(validated);
    const pathResult = await resolveWorktreePath(
      validated.repositoryRoot,
      validated.worktreeBinding.relativePath,
    );
    if (pathResult.status === ResultStatus.Failure) {
      return success(
        withDiagnostic(unavailableBase, {
          code: pathResult.error,
        }),
      );
    }

    let gitResult;
    try {
      gitResult = await readGitWorktreeState(this.runner, {
        cwd: pathResult.value.worktreeRoot,
        baseRevision: validated.baseRevision,
        timeoutMs: this.timeoutMs,
      });
    } catch {
      return success(
        withDiagnostic(unavailableBase, {
          code: WorktreeInspectionDiagnosticCode.GitCommandFailed,
          operation: WorktreeGitOperation.ResolveWorktreeRoot,
        }),
      );
    }

    if (gitResult.status === ResultStatus.Failure) {
      return success(withDiagnostic(unavailableBase, toDiagnostic(gitResult.error)));
    }

    let actualRoot: string;
    try {
      actualRoot = await realpath(gitResult.value.actualRoot);
    } catch {
      return success(
        withDiagnostic(unavailableBase, {
          code: WorktreeInspectionDiagnosticCode.ActualRootMismatch,
          operation: WorktreeGitOperation.ResolveWorktreeRoot,
        }),
      );
    }
    if (!sameResolvedPath(actualRoot, pathResult.value.worktreeRoot)) {
      return success(
        withDiagnostic(unavailableBase, {
          code: WorktreeInspectionDiagnosticCode.ActualRootMismatch,
          operation: WorktreeGitOperation.ResolveWorktreeRoot,
        }),
      );
    }

    const changes = sortChanges(gitResult.value.changes);
    const changedPaths = collectChangedPaths(changes);
    const writeSet = new Set(validated.writeSet);
    const writeSetViolations = changedPaths.filter((path) => !writeSet.has(path));
    const diagnostics = createStateDiagnostics(
      gitResult.value.actualBranchName,
      validated.worktreeBinding.branchName,
      gitResult.value.actualHeadRevision,
      gitResult.value.resolvedBaseRevision,
      writeSetViolations,
    );

    return success({
      ...unavailableBase,
      ...(gitResult.value.actualBranchName.length === 0
        ? {}
        : { actualBranchName: gitResult.value.actualBranchName }),
      resolvedBaseRevision: gitResult.value.resolvedBaseRevision,
      actualHeadRevision: gitResult.value.actualHeadRevision,
      status: determineStatus(diagnostics, changedPaths.length > 0, writeSetViolations.length > 0),
      changedPaths,
      writeSetViolations,
      changes,
      diagnostics,
    });
  }
}

function createBaseReport(input: ValidatedWorktreeInspectionInput): WorktreeInspectionReport {
  return {
    repositoryId: input.repositoryId,
    worktreeId: input.worktreeBinding.worktreeId,
    worktreeRelativePath: input.worktreeBinding.relativePath,
    expectedBranchName: input.worktreeBinding.branchName,
    declaredBaseRevision: input.baseRevision,
    status: WorktreeInspectionStatus.Unavailable,
    writeSet: input.writeSet,
    changedPaths: [],
    writeSetViolations: [],
    changes: [],
    diagnostics: [],
  };
}

function withDiagnostic(
  report: WorktreeInspectionReport,
  diagnostic: WorktreeInspectionDiagnostic,
): WorktreeInspectionReport {
  return { ...report, diagnostics: [diagnostic] };
}

function toDiagnostic(failure: GitWorktreeReadFailure): WorktreeInspectionDiagnostic {
  return { code: failure.code, operation: failure.operation };
}

function createStateDiagnostics(
  actualBranchName: string,
  expectedBranchName: string,
  actualHeadRevision: string,
  resolvedBaseRevision: string,
  writeSetViolations: readonly string[],
): readonly WorktreeInspectionDiagnostic[] {
  const diagnostics: WorktreeInspectionDiagnostic[] = [];
  if (actualBranchName !== expectedBranchName) {
    diagnostics.push({
      code: WorktreeInspectionDiagnosticCode.BranchMismatch,
      operation: WorktreeGitOperation.ResolveBranch,
    });
  }
  if (actualHeadRevision !== resolvedBaseRevision) {
    diagnostics.push({
      code: WorktreeInspectionDiagnosticCode.BaseRevisionMismatch,
      operation: WorktreeGitOperation.ResolveHeadRevision,
    });
  }
  for (const path of writeSetViolations) {
    diagnostics.push({
      code: WorktreeInspectionDiagnosticCode.DirtyPathOutsideWriteSet,
      operation: WorktreeGitOperation.ReadStatus,
      path,
    });
  }
  return diagnostics;
}

function determineStatus(
  diagnostics: readonly WorktreeInspectionDiagnostic[],
  hasChanges: boolean,
  hasWriteSetViolations: boolean,
): WorktreeInspectionStatus {
  if (hasWriteSetViolations) return WorktreeInspectionStatus.WriteSetViolation;
  if (
    diagnostics.some((item) => item.code === WorktreeInspectionDiagnosticCode.BaseRevisionMismatch)
  ) {
    return WorktreeInspectionStatus.BaseRevisionDrift;
  }
  if (diagnostics.some((item) => item.code === WorktreeInspectionDiagnosticCode.BranchMismatch)) {
    return WorktreeInspectionStatus.BranchMismatch;
  }
  return hasChanges ? WorktreeInspectionStatus.Dirty : WorktreeInspectionStatus.Ready;
}

function sortChanges(changes: readonly WorktreeChange[]): readonly WorktreeChange[] {
  return [...changes].sort((left, right) => {
    const pathOrder = comparePaths(left.path, right.path);
    if (pathOrder !== 0) return pathOrder;
    return comparePaths(left.originalPath ?? "", right.originalPath ?? "");
  });
}

function collectChangedPaths(changes: readonly WorktreeChange[]): readonly string[] {
  const paths = new Set<string>();
  for (const change of changes) {
    paths.add(change.path);
    if (change.originalPath !== undefined) paths.add(change.originalPath);
  }
  return [...paths].sort(comparePaths);
}

function comparePaths(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
