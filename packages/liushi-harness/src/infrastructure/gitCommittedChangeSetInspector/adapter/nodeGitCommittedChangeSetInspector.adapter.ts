import type {
  ContentDigestPort,
  GitCommittedChangeSetInspectorPort,
  InspectCommittedGitChangeSetInput,
  WorktreeInspectorPort,
} from "#application/ports/index.js";
import {
  WorktreeInspectionStatus,
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
  type CodingTaskSessionChange,
} from "#domain/codingTaskSessionChangeSet/index.js";
import {
  readDeletedTargetDigest,
  readStableTargetDigest,
} from "#infrastructure/gitChangeSetInspector/index.js";
import { createSanitizedGitCommandEnvironment } from "#infrastructure/gitCommand/index.js";
import type { CommandRunner } from "#infrastructure/system/index.js";
import { resolveManagedGitWorktreeIdentity } from "#infrastructure/worktree/index.js";

import { calculateGitNameStatusOutputBound } from "../output/index.js";
import { parseGitCommittedChangeSetStatus } from "../status/index.js";
import {
  committedGitChangeSetInputInvalid,
  isSameCommittedGitRevision,
  sameCommittedGitChangeSetPaths,
  validateCommittedGitChangeSetInput,
} from "../validation/index.js";

const GIT_DIFF_TIMEOUT_MS = 30_000;

/** 基于目标 Commit Worktree 与真实 Git diff 重建已提交 ChangeSet 的 Node 适配器。 */
export class NodeGitCommittedChangeSetInspectorAdapter implements GitCommittedChangeSetInspectorPort {
  /** 创建一个只读的已提交 ChangeSet Inspector。 */
  public constructor(
    private readonly runner: CommandRunner,
    private readonly worktreeInspector: WorktreeInspectorPort,
    private readonly digest: ContentDigestPort,
  ) {}

  /** 在目标 checkout 清洁且身份一致时，从 base 到 target 重建权威 ChangeSet。 */
  public async inspectCommitted(
    input: InspectCommittedGitChangeSetInput,
  ): Promise<Awaited<ReturnType<GitCommittedChangeSetInspectorPort["inspectCommitted"]>>> {
    const validatedInput = validateCommittedGitChangeSetInput(input);
    if (validatedInput.status === ResultStatus.Failure) {
      return failure(validatedInput.error);
    }

    try {
      const targetInspection = await this.worktreeInspector.inspect({
        repositoryId: validatedInput.value.repositoryId,
        repositoryRoot: validatedInput.value.repositoryRoot,
        worktreeBinding: validatedInput.value.worktreeBinding,
        baseRevision: validatedInput.value.targetRevision,
        writeSet: validatedInput.value.writeSet,
      });
      if (targetInspection.status === ResultStatus.Failure) {
        return failure(preconditionFailure("worktree_inspection_failed"));
      }
      if (!isTargetWorktreeReady(validatedInput.value, targetInspection.value)) {
        return failure(preconditionFailure("target_worktree_not_ready"));
      }

      const pathContext = await resolveManagedGitWorktreeIdentity(this.runner, {
        repositoryRoot: validatedInput.value.repositoryRoot,
        worktreeBinding: validatedInput.value.worktreeBinding,
      });
      if (pathContext.status === ResultStatus.Failure) {
        return failure(preconditionFailure("worktree_path_unavailable"));
      }

      const maxOutputBytes = calculateGitNameStatusOutputBound(validatedInput.value.writeSet);
      if (maxOutputBytes === undefined) {
        return failure(committedGitChangeSetInputInvalid("writeSet"));
      }
      const diff = await this.runner.run({
        executable: "git",
        args: [
          "diff",
          "--name-status",
          "-z",
          "--no-ext-diff",
          "--no-textconv",
          "--no-renames",
          validatedInput.value.baseRevision,
          validatedInput.value.targetRevision,
          "--",
        ],
        cwd: pathContext.value.worktreeRoot,
        timeoutMs: GIT_DIFF_TIMEOUT_MS,
        maxOutputBytes,
        environment: createSanitizedGitCommandEnvironment(),
      });
      if (
        diff.status === ResultStatus.Failure ||
        diff.value.launchError !== undefined ||
        diff.value.exitCode !== 0
      ) {
        return failure(preconditionFailure("git_diff_failed"));
      }

      const parsed = parseGitCommittedChangeSetStatus(diff.value.stdout);
      if (parsed.status === ResultStatus.Failure) {
        return failure(preconditionFailure("git_diff_output_invalid"));
      }

      const changes = await createChanges(parsed.value, pathContext.value.worktreeRoot);
      if (changes.status === ResultStatus.Failure) return changes;

      const changeSet = createCodingTaskSessionChangeSet(
        {
          repositoryId: validatedInput.value.repositoryId,
          baseRevision: validatedInput.value.baseRevision,
          changes: changes.value,
        },
        this.digest,
      );
      if (changeSet.status === ResultStatus.Failure) return changeSet;
      const changedPaths = collectCodingTaskSessionChangeSetChangedPaths(changeSet.value.changes);
      if (
        changedPaths.length === 0 ||
        changedPaths.some((path) => !validatedInput.value.writeSet.includes(path))
      ) {
        return failure(preconditionFailure("changed_path_outside_write_set"));
      }

      return changeSet;
    } catch {
      return failure(preconditionFailure("committed_change_set_unavailable"));
    }
  }
}

function isTargetWorktreeReady(
  input: InspectCommittedGitChangeSetInput,
  report: WorktreeInspectionReport,
): boolean {
  return (
    report.status === WorktreeInspectionStatus.Ready &&
    report.repositoryId === input.repositoryId &&
    report.worktreeId === input.worktreeBinding.worktreeId &&
    report.worktreeRelativePath === input.worktreeBinding.relativePath &&
    report.expectedBranchName === input.worktreeBinding.branchName &&
    report.actualBranchName === input.worktreeBinding.branchName &&
    report.declaredBaseRevision === input.targetRevision &&
    isSameCommittedGitRevision(report.resolvedBaseRevision, input.targetRevision) &&
    isSameCommittedGitRevision(report.actualHeadRevision, input.targetRevision) &&
    report.writeSet.length === input.writeSet.length &&
    sameCommittedGitChangeSetPaths(report.writeSet, input.writeSet) &&
    report.changedPaths.length === 0 &&
    report.writeSetViolations.length === 0 &&
    report.changes.length === 0 &&
    report.diagnostics.length === 0
  );
}

async function createChanges(
  changes: readonly { path: string; originalPath?: string; kind: string }[],
  worktreeRoot: string,
): Promise<Result<readonly CodingTaskSessionChange[], HarnessError>> {
  const result: CodingTaskSessionChange[] = [];
  for (const change of changes) {
    const kind = mapChangeKind(change.kind);
    if (kind.status === ResultStatus.Failure) return kind;

    const digest =
      change.kind === "deleted"
        ? await readDeletedTargetDigest(worktreeRoot, change.path)
        : await readStableTargetDigest(worktreeRoot, change.path);
    if (digest.status === ResultStatus.Failure) {
      return failure(preconditionFailure("target_content_unavailable"));
    }

    result.push({
      path: change.path,
      ...(change.originalPath === undefined ? {} : { originalPath: change.originalPath }),
      kind: kind.value,
      targetContentDigest: digest.value,
    });
  }
  return success(result);
}

function mapChangeKind(kind: string): Result<CodingTaskSessionChangeKind, HarnessError> {
  switch (kind) {
    case "modified":
      return success(CodingTaskSessionChangeKind.Modified);
    case "added":
      return success(CodingTaskSessionChangeKind.Added);
    case "deleted":
      return success(CodingTaskSessionChangeKind.Deleted);
    case "renamed":
      return success(CodingTaskSessionChangeKind.Renamed);
    case "copied":
      return success(CodingTaskSessionChangeKind.Copied);
    case "type_changed":
      return success(CodingTaskSessionChangeKind.TypeChanged);
    default:
      return failure(preconditionFailure("unsupported_change_kind"));
  }
}

function preconditionFailure(reason: string): HarnessError {
  return new HarnessError(
    HarnessErrorCode.PreconditionNotMet,
    "已提交 Git ChangeSet 无法形成权威结果。",
    { reason },
  );
}
