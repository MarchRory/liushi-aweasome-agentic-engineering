import { WorktreeProvisionRecoveryDiagnosticCode } from "#application/ports/worktreeProvisionRecoveryInspector/index.js";
import { failure, success, type Result } from "#common/index.js";

/** 解析后的最小 Git Worktree Registry 条目。 */
export interface GitWorktreeRegistryEntry {
  /** Registry 记录的 Worktree 绝对路径，仅限 Adapter 内部使用。 */
  readonly worktreePath: string;
  /** Registry 记录的 HEAD Revision。 */
  readonly headRevision: string;
  /** Registry 记录的本地分支；Detached HEAD 时不存在。 */
  readonly branchName?: string;
}

/** 解析 `git worktree list --porcelain -z`，不保留原始输出。 */
export function parseGitWorktreePorcelainZ(
  output: string,
): Result<readonly GitWorktreeRegistryEntry[], WorktreeProvisionRecoveryDiagnosticCode> {
  if (!output.endsWith("\0")) {
    return failure(WorktreeProvisionRecoveryDiagnosticCode.RegistryOutputInvalid);
  }

  const entries: GitWorktreeRegistryEntry[] = [];
  let fields: string[] = [];
  for (const field of output.split("\0")) {
    if (field.length === 0) {
      if (fields.length > 0) {
        const parsed = parseEntry(fields);
        if (parsed === undefined) {
          return failure(WorktreeProvisionRecoveryDiagnosticCode.RegistryOutputInvalid);
        }
        entries.push(parsed);
        fields = [];
      }
      continue;
    }
    fields.push(field);
  }
  return success(entries);
}

function parseEntry(fields: readonly string[]): GitWorktreeRegistryEntry | undefined {
  const worktree = singleFieldValue(fields, "worktree ");
  const head = singleFieldValue(fields, "HEAD ");
  const branchRef = singleFieldValue(fields, "branch ", true);
  if (
    worktree === undefined ||
    worktree === null ||
    worktree.length === 0 ||
    head === undefined ||
    head === null ||
    !/^[0-9a-f]{40,64}$/u.test(head)
  ) {
    return undefined;
  }
  if (
    branchRef === null ||
    (branchRef !== undefined &&
      (!branchRef.startsWith("refs/heads/") || branchRef.length === "refs/heads/".length)) ||
    (branchRef !== undefined && fields.includes("detached"))
  ) {
    return undefined;
  }
  return {
    worktreePath: worktree,
    headRevision: head,
    ...(branchRef === undefined ? {} : { branchName: branchRef.slice("refs/heads/".length) }),
  };
}

function singleFieldValue(
  fields: readonly string[],
  prefix: string,
  optional = false,
): string | null | undefined {
  const matches = fields.filter((field) => field.startsWith(prefix));
  if (matches.length > 1) return null;
  if (matches.length === 0) return optional ? undefined : null;
  return matches[0]?.slice(prefix.length);
}
