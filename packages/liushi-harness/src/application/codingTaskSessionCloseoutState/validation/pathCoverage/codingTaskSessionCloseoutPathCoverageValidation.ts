import type { CodingTaskSessionActionCoverageManifest } from "#application/codingTaskSessionActionCoverage/index.js";
import { HarnessError, HarnessErrorCode, failure, success, type Result } from "#common/index.js";
import type { CodingTaskSessionChangeSetSnapshot } from "#domain/codingTaskSessionChangeSet/index.js";

/** 验证 Snapshot changedPaths 被 Action targets 完整覆盖且目标不越过 Write Set。 */
export function validateCloseoutCoveragePaths(
  snapshot: CodingTaskSessionChangeSetSnapshot,
  manifest: CodingTaskSessionActionCoverageManifest,
): Result<void, HarnessError> {
  const targets = new Set(manifest.actions.flatMap((action) => action.targets));
  const uncoveredPath = snapshot.changedPaths.find((path) => !targets.has(path));
  if (uncoveredPath !== undefined) {
    return failure(
      pathCoverageMismatch(`Snapshot changedPath 缺少 Action target 覆盖：${uncoveredPath}。`),
    );
  }
  const outsideWriteSet = [...targets].find((target) => !snapshot.writeSet.includes(target));
  return outsideWriteSet === undefined
    ? success(undefined)
    : failure(pathCoverageMismatch(`Action target 越过 Snapshot Write Set：${outsideWriteSet}。`));
}

function pathCoverageMismatch(message: string): HarnessError {
  return new HarnessError(HarnessErrorCode.PreconditionNotMet, message);
}
