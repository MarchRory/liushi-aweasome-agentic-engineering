import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { failure, success, type Result } from "#common/index.js";
import {
  WorktreeInspectionDiagnosticCode,
  type WorktreeInspectionDiagnosticCode as WorktreePathFailureCode,
} from "#application/ports/worktree/index.js";
import { samePathIdentity } from "#infrastructure/system/index.js";

/** 已通过真实路径 containment 检查的运行时 Worktree 路径。 */
export interface WorktreePathContext {
  /** 解析后的 Repository Root，仅在 Adapter 内部使用。 */
  repositoryRoot: string;
  /** 解析后的 Worktree Root，仅在 Adapter 内部使用。 */
  worktreeRoot: string;
}

/** 解析 Worktree 运行时路径失败时使用的稳定诊断码。 */
export type WorktreePathFailure = WorktreePathFailureCode;

/** 解析并检查 Repository Root、Worktree Root 及符号链接 containment。 */
export async function resolveWorktreePath(
  repositoryRoot: string,
  worktreeRelativePath: string,
): Promise<Result<WorktreePathContext, WorktreePathFailure>> {
  let resolvedRepositoryRoot: string;
  try {
    resolvedRepositoryRoot = await realpath(repositoryRoot);
    const rootStats = await lstat(resolvedRepositoryRoot);
    if (!rootStats.isDirectory()) {
      return failure(WorktreeInspectionDiagnosticCode.RepositoryRootUnavailable);
    }
  } catch {
    return failure(WorktreeInspectionDiagnosticCode.RepositoryRootUnavailable);
  }

  const candidatePath = resolve(resolvedRepositoryRoot, ...worktreeRelativePath.split("/"));
  if (!isWithinRoot(resolvedRepositoryRoot, candidatePath)) {
    return failure(WorktreeInspectionDiagnosticCode.WorktreePathEscapesRoot);
  }

  let resolvedWorktreeRoot: string;
  try {
    resolvedWorktreeRoot = await realpath(candidatePath);
    const worktreeStats = await lstat(resolvedWorktreeRoot);
    if (!worktreeStats.isDirectory()) {
      return failure(WorktreeInspectionDiagnosticCode.WorktreeUnavailable);
    }
  } catch {
    return failure(WorktreeInspectionDiagnosticCode.WorktreeUnavailable);
  }

  if (!isWithinRoot(resolvedRepositoryRoot, resolvedWorktreeRoot)) {
    return failure(WorktreeInspectionDiagnosticCode.WorktreePathEscapesRoot);
  }

  return success({
    repositoryRoot: resolvedRepositoryRoot,
    worktreeRoot: resolvedWorktreeRoot,
  });
}

/** 判断候选真实路径是否位于 Root 本身或其后代目录。 */
export function isWithinRoot(root: string, candidate: string): boolean {
  if (!isAbsolute(root) || !isAbsolute(candidate)) {
    return false;
  }

  const relativePath = relative(root, candidate);
  return (
    (relativePath === "" && candidate === root) ||
    (relativePath !== ".." && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath))
  );
}

/** 判断两个已解析路径是否表示同一个目录。 */
export function sameResolvedPath(left: string, right: string): boolean {
  return samePathIdentity(left, right);
}
