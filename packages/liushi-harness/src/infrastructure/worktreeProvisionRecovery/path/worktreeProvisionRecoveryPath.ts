import { lstat, realpath } from "node:fs/promises";
import { resolve } from "node:path";

import { WorktreeProvisionRecoveryDiagnosticCode } from "#application/ports/index.js";
import { failure, success, type Result } from "#common/index.js";
import { isWithinRoot } from "#infrastructure/worktree/path/index.js";

/** Adapter 内部使用的目标路径事实。 */
export interface WorktreeProvisionRecoveryPathState {
  /** 解析真实路径后的可信 Repository Root。 */
  readonly repositoryRoot: string;
  /** 解析后的目标 Worktree 路径，仅限 Adapter 内部使用。 */
  readonly targetPath: string;
  /** 目标路径是否已经存在且为安全目录。 */
  readonly exists: boolean;
}

/** 解析可信 Root 与目标路径，并对符号链接执行 containment 检查。 */
export async function resolveWorktreeProvisionRecoveryPath(
  repositoryRoot: string,
  relativePath: string,
): Promise<Result<WorktreeProvisionRecoveryPathState, WorktreeProvisionRecoveryDiagnosticCode>> {
  let resolvedRoot: string;
  try {
    resolvedRoot = await realpath(repositoryRoot);
    if (!(await lstat(resolvedRoot)).isDirectory()) throw new Error("not-directory");
  } catch {
    return failure(WorktreeProvisionRecoveryDiagnosticCode.RepositoryRootUnavailable);
  }

  const targetPath = resolve(resolvedRoot, ...relativePath.split("/"));
  if (!isWithinRoot(resolvedRoot, targetPath)) {
    return failure(WorktreeProvisionRecoveryDiagnosticCode.TargetPathEscapesRoot);
  }

  let targetStats;
  try {
    targetStats = await lstat(targetPath);
  } catch (error) {
    return isMissingPathError(error)
      ? success({ repositoryRoot: resolvedRoot, targetPath, exists: false })
      : failure(WorktreeProvisionRecoveryDiagnosticCode.TargetPathInvalid);
  }

  try {
    const resolvedTarget = await realpath(targetPath);
    if (!isWithinRoot(resolvedRoot, resolvedTarget)) {
      return failure(WorktreeProvisionRecoveryDiagnosticCode.TargetPathEscapesRoot);
    }
    if (!targetStats.isDirectory() || !(await lstat(resolvedTarget)).isDirectory()) {
      return failure(WorktreeProvisionRecoveryDiagnosticCode.TargetPathInvalid);
    }
    return success({ repositoryRoot: resolvedRoot, targetPath: resolvedTarget, exists: true });
  } catch {
    return failure(WorktreeProvisionRecoveryDiagnosticCode.TargetPathInvalid);
  }
}

function isMissingPathError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { readonly code?: unknown }).code === "ENOENT"
  );
}
