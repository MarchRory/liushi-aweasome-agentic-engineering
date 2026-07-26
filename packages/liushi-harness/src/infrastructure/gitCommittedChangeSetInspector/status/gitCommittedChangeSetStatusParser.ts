import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import { normalizeWriteSet } from "#domain/codingTask/index.js";
import { WorktreeChangeKind, type WorktreeChange } from "#application/ports/worktree/index.js";

/** 由 Git `diff --name-status -z` 状态标记派生的解析描述。 */
interface StatusDescriptor {
  /** 解析后的 Worktree 变化类型。 */
  readonly kind: WorktreeChangeKind;
  /** 是否还需要读取原始路径。 */
  readonly hasOriginalPath: boolean;
}

/** 独立解析已提交 Git diff 的 NUL 分隔状态，不接受无法证明语义的记录。 */
export function parseGitCommittedChangeSetStatus(
  output: string,
): Result<readonly WorktreeChange[], HarnessError> {
  if (output.length === 0) return success([]);
  if (!output.endsWith("\u0000")) return failure(invalidOutput("terminator"));

  const tokens = output.slice(0, -1).split("\u0000");
  const changes: WorktreeChange[] = [];
  const targetPaths = new Set<string>();
  let tokenIndex = 0;

  while (tokenIndex < tokens.length) {
    const statusToken = tokens[tokenIndex];
    tokenIndex += 1;
    if (statusToken === undefined) return failure(invalidOutput("status"));

    const descriptor = describeStatus(statusToken);
    if (descriptor === undefined) return failure(invalidOutput("status"));

    const firstPath = parsePath(tokens[tokenIndex]);
    tokenIndex += 1;
    if (firstPath.status === ResultStatus.Failure) return firstPath;

    let path = firstPath.value;
    let originalPath: string | undefined;
    if (descriptor.hasOriginalPath) {
      const secondPath = parsePath(tokens[tokenIndex]);
      tokenIndex += 1;
      if (secondPath.status === ResultStatus.Failure) return secondPath;
      originalPath = firstPath.value;
      path = secondPath.value;
      if (originalPath === path) return failure(invalidOutput("rename_or_copy_path"));
    }

    if (targetPaths.has(path)) return failure(invalidOutput("duplicate_target"));
    targetPaths.add(path);
    changes.push({
      path,
      ...(originalPath === undefined ? {} : { originalPath }),
      kind: descriptor.kind,
    });
  }

  return success(changes);
}

function describeStatus(status: string): StatusDescriptor | undefined {
  switch (status) {
    case "M":
      return { kind: WorktreeChangeKind.Modified, hasOriginalPath: false };
    case "A":
      return { kind: WorktreeChangeKind.Added, hasOriginalPath: false };
    case "D":
      return { kind: WorktreeChangeKind.Deleted, hasOriginalPath: false };
    case "T":
      return { kind: WorktreeChangeKind.TypeChanged, hasOriginalPath: false };
    default:
      if (/^R\d{3}$/u.test(status) && Number(status.slice(1)) <= 100) {
        return { kind: WorktreeChangeKind.Renamed, hasOriginalPath: true };
      }
      if (/^C\d{3}$/u.test(status) && Number(status.slice(1)) <= 100) {
        return { kind: WorktreeChangeKind.Copied, hasOriginalPath: true };
      }
      return undefined;
  }
}

function parsePath(value: string | undefined): Result<string, HarnessError> {
  if (
    value === undefined ||
    value.length === 0 ||
    value !== value.trim() ||
    /[\\\u0000-\u001f\u007f]/u.test(value)
  ) {
    return failure(invalidOutput("path"));
  }

  try {
    const normalized = normalizeWriteSet([value]);
    return normalized[0] === value ? success(value) : failure(invalidOutput("path"));
  } catch {
    return failure(invalidOutput("path"));
  }
}

function invalidOutput(field: string): HarnessError {
  return new HarnessError(HarnessErrorCode.InvalidInput, "已提交 Git ChangeSet 状态输出无效。", {
    field,
  });
}
