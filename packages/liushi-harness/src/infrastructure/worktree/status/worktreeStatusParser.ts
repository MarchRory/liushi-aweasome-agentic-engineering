import {
  failure,
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  success,
  type Result,
} from "#common/index.js";
import { normalizeWriteSet } from "#domain/codingTask/index.js";
import { WorktreeChangeKind, type WorktreeChange } from "#application/ports/worktree/index.js";

/** 解析 `git status --porcelain=v1 -z` 的结构化变化集合。 */
export function parseWorktreeStatus(
  output: string,
): Result<readonly WorktreeChange[], HarnessError> {
  if (output.length === 0) {
    return success([]);
  }
  if (!output.endsWith("\u0000")) {
    return failure(invalidStatus("status.output"));
  }

  const tokens = output.slice(0, -1).split("\u0000");
  const changes: WorktreeChange[] = [];
  let tokenIndex = 0;

  while (tokenIndex < tokens.length) {
    const statusToken = tokens[tokenIndex];
    tokenIndex += 1;
    if (statusToken === undefined || statusToken.length < 4) {
      return failure(invalidStatus("status.record"));
    }

    const header = parseStatusHeader(statusToken);
    if (header.status === ResultStatus.Failure) {
      return header;
    }

    const pathResult = normalizeStatusPath(header.value.rawPath);
    if (pathResult.status === ResultStatus.Failure) {
      return pathResult;
    }
    const statusPair = header.value.statusPair;

    let originalPath: string | undefined;
    if (isRenameOrCopy(statusPair)) {
      const originalToken = tokens[tokenIndex];
      tokenIndex += 1;
      if (originalToken === undefined || originalToken.length === 0) {
        return failure(invalidStatus("status.originalPath"));
      }

      const originalResult = normalizeStatusPath(originalToken);
      if (originalResult.status === ResultStatus.Failure) {
        return originalResult;
      }
      originalPath = originalResult.value;
    }

    changes.push({
      path: pathResult.value,
      ...(originalPath === undefined ? {} : { originalPath }),
      kind: classifyChange(statusPair),
    });
  }

  return success(changes);
}

function parseStatusHeader(
  statusToken: string,
): Result<{ statusPair: string; rawPath: string }, HarnessError> {
  if (statusToken.length < 4) {
    return failure(invalidStatus("status.path"));
  }

  if (
    (statusToken.startsWith("R") || statusToken.startsWith("C")) &&
    /^.[0-9]{3} /u.test(statusToken)
  ) {
    return success({
      statusPair: `${statusToken[0]} `,
      rawPath: statusToken.slice(5),
    });
  }

  if (statusToken[2] !== " ") {
    return failure(invalidStatus("status.record"));
  }
  return success({
    statusPair: statusToken.slice(0, 2),
    rawPath: statusToken.slice(3),
  });
}

function normalizeStatusPath(value: string): Result<string, HarnessError> {
  const posixPath = value.replaceAll("\\", "/");
  try {
    const normalized = normalizeWriteSet([posixPath]);
    if (normalized[0] !== posixPath) {
      return failure(invalidStatus("status.path"));
    }
    return success(normalized[0]);
  } catch {
    return failure(invalidStatus("status.path"));
  }
}

function classifyChange(statusPair: string): WorktreeChangeKind {
  if (statusPair === "??") return WorktreeChangeKind.Untracked;
  if (statusPair.includes("R")) return WorktreeChangeKind.Renamed;
  if (statusPair.includes("C")) return WorktreeChangeKind.Copied;
  if (statusPair.includes("U")) return WorktreeChangeKind.Unmerged;
  if (statusPair.includes("D")) return WorktreeChangeKind.Deleted;
  if (statusPair.includes("A")) return WorktreeChangeKind.Added;
  if (statusPair.includes("T")) return WorktreeChangeKind.TypeChanged;
  if (statusPair.includes("M")) return WorktreeChangeKind.Modified;
  return WorktreeChangeKind.Unknown;
}

function isRenameOrCopy(statusPair: string): boolean {
  return statusPair.includes("R") || statusPair.includes("C");
}

function invalidStatus(field: string): HarnessError {
  return new HarnessError(HarnessErrorCode.InvalidInput, "Git status output is invalid.", {
    field,
  });
}
