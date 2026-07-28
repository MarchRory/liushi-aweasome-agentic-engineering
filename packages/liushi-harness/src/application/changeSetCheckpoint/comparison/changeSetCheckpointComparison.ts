import type { ChangeSetCheckpoint } from "../contracts/index.js";

/** 精确比较两个 ChangeSet Checkpoint 的全部稳定绑定字段。 */
export function hasSameChangeSetCheckpoint(
  left: ChangeSetCheckpoint,
  right: ChangeSetCheckpoint,
): boolean {
  return (
    left.schemaVersion === right.schemaVersion &&
    left.bindingDigest === right.bindingDigest &&
    left.changeSetDigest === right.changeSetDigest &&
    left.preSubmitSnapshotDigest === right.preSubmitSnapshotDigest &&
    left.checkpoint.targetRevision === right.checkpoint.targetRevision &&
    left.checkpoint.checkpointDigest === right.checkpoint.checkpointDigest &&
    samePaths(left.checkpoint.changedPaths, right.checkpoint.changedPaths)
  );
}

function samePaths(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((path, index) => path === right[index]);
}
