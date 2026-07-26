import type {
  ContentDigestPort,
  GitChangeSetInspectorPort,
  InspectGitChangeSetInput,
  WorktreeInspectorPort,
} from "#application/ports/index.js";
import {
  WorktreeChangeKind,
  WorktreeInspectionStatus,
  type WorktreeChange,
  type WorktreeInspectionReport,
} from "#application/ports/worktree/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import {
  CodingTaskSessionChangeKind,
  collectCodingTaskSessionChangeSetChangedPaths,
  createCodingTaskSessionChangeSet,
  createCodingTaskSessionChangeSetSnapshot,
  type CodingTaskSessionChange,
  type CodingTaskSessionChangeSetSnapshot,
} from "#domain/codingTaskSessionChangeSet/index.js";
import { resolveWorktreePath } from "#infrastructure/worktree/path/index.js";

import { readDeletedTargetDigest, readStableTargetDigest } from "../io/index.js";

/** 基于权威 Worktree Inspector 构建稳定 Git ChangeSet Snapshot 的 Node 适配器。 */
export class NodeGitChangeSetInspectorAdapter implements GitChangeSetInspectorPort {
  public constructor(
    private readonly worktreeInspector: WorktreeInspectorPort,
    private readonly digest: ContentDigestPort,
  ) {}

  /** 两次检查提交前 dirty Worktree，并仅在快照摘要完全一致时返回结果。 */
  public async inspectPreSubmit(
    input: InspectGitChangeSetInput,
  ): Promise<Result<CodingTaskSessionChangeSetSnapshot, HarnessError>> {
    if (!isManagedInput(input)) {
      return failure(preconditionFailure("managed_worktree_required"));
    }

    try {
      const first = await this.buildSnapshot(input);
      if (first.status === ResultStatus.Failure) return first;

      const second = await this.buildSnapshot(input);
      if (second.status === ResultStatus.Failure) return second;
      if (first.value.snapshotDigest !== second.value.snapshotDigest) {
        return failure(preconditionFailure("snapshot_digest_mismatch"));
      }
      return success(first.value);
    } catch {
      return failure(preconditionFailure("snapshot_build_failed"));
    }
  }

  private async buildSnapshot(
    input: InspectGitChangeSetInput,
  ): Promise<Result<CodingTaskSessionChangeSetSnapshot, HarnessError>> {
    const inspection = await this.worktreeInspector.inspect(input);
    if (inspection.status === ResultStatus.Failure) {
      return failure(preconditionFailure("worktree_inspection_failed"));
    }

    const report = inspection.value;
    const identity = validateInspectionReport(input, report);
    if (identity.status === ResultStatus.Failure) return identity;

    const pathContext = await resolveWorktreePath(
      input.repositoryRoot,
      input.worktreeBinding.relativePath,
    );
    if (pathContext.status === ResultStatus.Failure) {
      return failure(preconditionFailure("worktree_path_unavailable"));
    }

    const changes = await createChanges(report.changes, pathContext.value.worktreeRoot);
    if (changes.status === ResultStatus.Failure) return changes;

    const changeSet = createCodingTaskSessionChangeSet(
      {
        repositoryId: report.repositoryId,
        baseRevision: identity.value.resolvedBaseRevision,
        changes: changes.value,
      },
      this.digest,
    );
    if (changeSet.status === ResultStatus.Failure) return changeSet;

    const changedPaths = collectCodingTaskSessionChangeSetChangedPaths(changeSet.value.changes);
    if (!sameOrderedPaths(changedPaths, report.changedPaths)) {
      return failure(preconditionFailure("changed_paths_mismatch"));
    }

    return createCodingTaskSessionChangeSetSnapshot(
      {
        changeSet: changeSet.value,
        worktreeId: report.worktreeId,
        worktreeRelativePath: report.worktreeRelativePath,
        branchName: identity.value.actualBranchName,
        observedHeadRevision: identity.value.actualHeadRevision,
        writeSet: report.writeSet,
      },
      this.digest,
    );
  }
}

/** 通过 Worktree Inspector 校验后的不可缺失现场身份。 */
interface ValidatedInspectionIdentity {
  /** 实际观察到的受管分支名称。 */
  readonly actualBranchName: string;
  /** Inspector 解析得到的基线提交。 */
  readonly resolvedBaseRevision: string;
  /** 实际观察到的 Worktree HEAD 提交。 */
  readonly actualHeadRevision: string;
}

async function createChanges(
  changes: readonly WorktreeChange[],
  worktreeRoot: string,
): Promise<Result<readonly CodingTaskSessionChange[], HarnessError>> {
  const result: CodingTaskSessionChange[] = [];
  for (const change of changes) {
    const kind = mapChangeKind(change.kind, change.path);
    if (kind.status === ResultStatus.Failure) return kind;

    const digest =
      change.kind === WorktreeChangeKind.Deleted
        ? await readDeletedTargetDigest(worktreeRoot, change.path)
        : await readStableTargetDigest(worktreeRoot, change.path);
    if (digest.status === ResultStatus.Failure) return digest;

    result.push({
      path: change.path,
      ...(change.originalPath === undefined ? {} : { originalPath: change.originalPath }),
      kind: kind.value,
      targetContentDigest: digest.value,
    });
  }
  return success(result);
}

function mapChangeKind(
  kind: WorktreeChangeKind,
  path: string,
): Result<CodingTaskSessionChangeKind, HarnessError> {
  switch (kind) {
    case WorktreeChangeKind.Modified:
      return success(CodingTaskSessionChangeKind.Modified);
    case WorktreeChangeKind.Added:
      return success(CodingTaskSessionChangeKind.Added);
    case WorktreeChangeKind.Deleted:
      return success(CodingTaskSessionChangeKind.Deleted);
    case WorktreeChangeKind.Renamed:
      return success(CodingTaskSessionChangeKind.Renamed);
    case WorktreeChangeKind.Copied:
      return success(CodingTaskSessionChangeKind.Copied);
    case WorktreeChangeKind.Untracked:
      return success(CodingTaskSessionChangeKind.Added);
    case WorktreeChangeKind.TypeChanged:
      return success(CodingTaskSessionChangeKind.TypeChanged);
    case WorktreeChangeKind.Unmerged:
      return failure(preconditionFailureForPath(path, "unmerged_change"));
    case WorktreeChangeKind.Unknown:
      return failure(preconditionFailureForPath(path, "unknown_change"));
  }
}

function validateInspectionReport(
  input: InspectGitChangeSetInput,
  report: WorktreeInspectionReport,
): Result<ValidatedInspectionIdentity, HarnessError> {
  if (
    report.status !== WorktreeInspectionStatus.Dirty ||
    report.changes.length === 0 ||
    report.changedPaths.length === 0
  ) {
    return failure(preconditionFailure("worktree_not_dirty"));
  }
  if (
    report.repositoryId !== input.repositoryId ||
    report.worktreeId !== input.worktreeBinding.worktreeId ||
    report.worktreeRelativePath !== input.worktreeBinding.relativePath ||
    report.expectedBranchName !== input.worktreeBinding.branchName ||
    report.declaredBaseRevision !== input.baseRevision ||
    !sameOrderedPaths(report.writeSet, input.writeSet) ||
    report.writeSetViolations.length !== 0 ||
    report.diagnostics.length !== 0
  ) {
    return failure(preconditionFailure("worktree_identity_mismatch"));
  }

  const actualBranchName = report.actualBranchName;
  const resolvedBaseRevision = report.resolvedBaseRevision;
  const actualHeadRevision = report.actualHeadRevision;
  if (
    !isNonBlank(actualBranchName) ||
    actualBranchName !== report.expectedBranchName ||
    !isNonBlank(resolvedBaseRevision) ||
    !isNonBlank(actualHeadRevision) ||
    actualHeadRevision !== resolvedBaseRevision
  ) {
    return failure(preconditionFailure("worktree_identity_incomplete"));
  }
  return success({ actualBranchName, resolvedBaseRevision, actualHeadRevision });
}

function sameOrderedPaths(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((path, index) => path === right[index]);
}

function isManagedInput(input: InspectGitChangeSetInput): boolean {
  return input !== null && typeof input === "object" && input.worktreeBinding?.managed === true;
}

function isNonBlank(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function preconditionFailure(reason: string): HarnessError {
  return new HarnessError(
    HarnessErrorCode.PreconditionNotMet,
    "Git ChangeSet 现场不满足稳定快照前置条件。",
    { reason },
  );
}

function preconditionFailureForPath(path: string, reason: string): HarnessError {
  return new HarnessError(
    HarnessErrorCode.PreconditionNotMet,
    "Git ChangeSet 变更无法形成稳定快照。",
    isSafeRelativePath(path) ? { path, reason } : { reason },
  );
}

function isSafeRelativePath(value: string): boolean {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    !value.includes("\\") &&
    !value.startsWith("/") &&
    !/^[A-Za-z]:/u.test(value) &&
    !value.split("/").some((part) => part.length === 0 || part === "." || part === "..")
  );
}
