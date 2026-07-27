import type { CodingTaskSessionCloseoutRecoveryState } from "#application/codingTaskSessionCloseoutRecovery/state/index.js";
import type { CodingTaskSessionCloseoutState } from "#application/codingTaskSessionCloseoutState/index.js";
import type { ContentDigest } from "#common/index.js";

import { CodingTaskSessionEffectiveCloseoutUnresolvedReason } from "../enums/index.js";

/** 校验原 Closeout 与 Recovery 的稳定身份绑定。 */
export function findIdentityMismatch(
  closeout: CodingTaskSessionCloseoutState,
  recovery: CodingTaskSessionCloseoutRecoveryState,
): CodingTaskSessionEffectiveCloseoutUnresolvedReason | null {
  return closeout.workspaceId !== recovery.workspaceId ||
    closeout.sessionId !== recovery.sessionId ||
    closeout.codingTaskId !== recovery.codingTaskId ||
    closeout.sourceTaskId !== recovery.sourceTaskId ||
    closeout.repositoryId !== recovery.repositoryId ||
    closeout.attemptNumber !== recovery.attemptNumber
    ? CodingTaskSessionEffectiveCloseoutUnresolvedReason.IdentityMismatch
    : null;
}

/** 校验 Recovery 与原 Closeout State 的版本及完整摘要绑定。 */
export function findCloseoutBindingMismatch(
  closeout: CodingTaskSessionCloseoutState,
  recovery: CodingTaskSessionCloseoutRecoveryState,
  closeoutStateDigest: ContentDigest,
): CodingTaskSessionEffectiveCloseoutUnresolvedReason | null {
  return closeout.version !== recovery.closeoutVersion ||
    closeoutStateDigest !== recovery.closeoutStateDigest
    ? CodingTaskSessionEffectiveCloseoutUnresolvedReason.CloseoutBindingMismatch
    : null;
}

/** 校验原 Snapshot 与 Recovery 记录的摘要绑定。 */
export function findSnapshotBindingMismatch(
  closeout: CodingTaskSessionCloseoutState,
  recovery: CodingTaskSessionCloseoutRecoveryState,
): CodingTaskSessionEffectiveCloseoutUnresolvedReason | null {
  const snapshot = closeout.snapshot;
  return snapshot === null ||
    snapshot.snapshotDigest !== recovery.preSubmitSnapshotDigest ||
    snapshot.changeSetDigest !== recovery.changeSetDigest
    ? CodingTaskSessionEffectiveCloseoutUnresolvedReason.SnapshotBindingMismatch
    : null;
}

/**
 * 校验 Recovery Checkpoint 与原 Closeout 的跨模型绑定。
 * Recovery Store 已负责重算 Checkpoint Digest、Binding Digest 与 Assessment Binding。
 */
export function findCheckpointBindingMismatch(
  closeout: CodingTaskSessionCloseoutState,
  recovery: CodingTaskSessionCloseoutRecoveryState,
): CodingTaskSessionEffectiveCloseoutUnresolvedReason | null {
  const checkpoint = recovery.checkpoint;
  const snapshot = closeout.snapshot;
  return checkpoint === null ||
    snapshot === null ||
    checkpoint.preSubmitSnapshotDigest !== recovery.preSubmitSnapshotDigest ||
    checkpoint.changeSetDigest !== recovery.changeSetDigest ||
    checkpoint.preSubmitSnapshotDigest !== snapshot.snapshotDigest ||
    checkpoint.changeSetDigest !== snapshot.changeSetDigest ||
    checkpoint.checkpoint.changedPaths.length !== snapshot.changedPaths.length ||
    !checkpoint.checkpoint.changedPaths.every(
      (path, index) => path === snapshot.changedPaths[index],
    )
    ? CodingTaskSessionEffectiveCloseoutUnresolvedReason.CheckpointBindingMismatch
    : null;
}
