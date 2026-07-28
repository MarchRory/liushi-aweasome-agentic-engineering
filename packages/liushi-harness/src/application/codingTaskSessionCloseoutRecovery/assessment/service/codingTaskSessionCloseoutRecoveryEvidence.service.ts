import {
  ChangeSetCheckpointRecoveryStatus,
  hasSameChangeSetCheckpoint,
  type ChangeSetCheckpoint,
  type ChangeSetCheckpointInput,
  type ChangeSetCheckpointRecoveryAssessment,
} from "#application/changeSetCheckpoint/index.js";
import {
  createSnapshotInput,
  type CodingTaskSessionCloseoutAuthority,
} from "#application/codingTaskSessionCloseout/index.js";
import { rebuildCloseoutCheckpoint } from "#application/codingTaskSessionCloseoutState/validation/index.js";
import { ResultStatus } from "#common/index.js";
import {
  verifyCodingTaskSessionChangeSetSnapshot,
  type CodingTaskSessionChangeSetSnapshot,
} from "#domain/codingTaskSessionChangeSet/index.js";

import type { CodingTaskSessionCloseoutRecoveryAssessmentServiceDependencies } from "../contracts/index.js";

/** 只读评估并严格规范化 ChangeSet-bound Checkpoint 现场。 */
export async function assessRecoveryCheckpoint(
  dependencies: CodingTaskSessionCloseoutRecoveryAssessmentServiceDependencies,
  input: ChangeSetCheckpointInput,
): Promise<ChangeSetCheckpointRecoveryAssessment> {
  try {
    const result = await dependencies.checkpointRecovery.assess(input);
    return result.status === ResultStatus.Success
      ? normalizeCheckpointRecovery(result.value, dependencies)
      : unknownRecoveryCheckpoint();
  } catch {
    return unknownRecoveryCheckpoint();
  }
}

/** 只读重建并复验当前提交前 Snapshot。 */
export async function inspectFreshRecoverySnapshot(
  dependencies: CodingTaskSessionCloseoutRecoveryAssessmentServiceDependencies,
  authority: CodingTaskSessionCloseoutAuthority,
): Promise<FreshRecoverySnapshotCheck> {
  try {
    const input = createSnapshotInput(authority);
    const result = await dependencies.snapshotInspector.execute(input);
    if (result.status === ResultStatus.Failure) {
      return { outcome: FreshRecoverySnapshotOutcome.Unknown };
    }
    const verified = verifyCodingTaskSessionChangeSetSnapshot(result.value, dependencies.digest);
    if (verified.status === ResultStatus.Failure) {
      return { outcome: FreshRecoverySnapshotOutcome.Drift };
    }
    return sameSnapshotBinding(verified.value, input)
      ? { outcome: FreshRecoverySnapshotOutcome.Verified, snapshot: verified.value }
      : { outcome: FreshRecoverySnapshotOutcome.Drift };
  } catch {
    return { outcome: FreshRecoverySnapshotOutcome.Unknown };
  }
}

/** 精确比较新复验 Checkpoint 与 Closeout State 保留的完整绑定。 */
export function hasSameRecoveryCheckpoint(
  recovery: Extract<
    ChangeSetCheckpointRecoveryAssessment,
    { status: ChangeSetCheckpointRecoveryStatus.Present }
  >,
  retained: ChangeSetCheckpoint,
): boolean {
  return hasSameChangeSetCheckpoint(recovery.checkpoint, retained);
}

/** 创建无法证明 Checkpoint 状态的封闭结果。 */
export function unknownRecoveryCheckpoint(): ChangeSetCheckpointRecoveryAssessment {
  return { status: ChangeSetCheckpointRecoveryStatus.Unknown };
}

function normalizeCheckpointRecovery(
  recovery: ChangeSetCheckpointRecoveryAssessment,
  dependencies: CodingTaskSessionCloseoutRecoveryAssessmentServiceDependencies,
): ChangeSetCheckpointRecoveryAssessment {
  switch (recovery.status) {
    case ChangeSetCheckpointRecoveryStatus.Absent:
    case ChangeSetCheckpointRecoveryStatus.Unknown:
      return recovery;
    case ChangeSetCheckpointRecoveryStatus.Present: {
      const rebuilt = rebuildCloseoutCheckpoint(recovery.checkpoint, dependencies.digest);
      return rebuilt.status === ResultStatus.Success
        ? { status: ChangeSetCheckpointRecoveryStatus.Present, checkpoint: rebuilt.value }
        : unknownRecoveryCheckpoint();
    }
    default:
      return unknownRecoveryCheckpoint();
  }
}

function sameSnapshotBinding(
  snapshot: CodingTaskSessionChangeSetSnapshot,
  input: ReturnType<typeof createSnapshotInput>,
): boolean {
  return (
    snapshot.repositoryId === input.repositoryId &&
    snapshot.worktreeId === input.worktreeBinding.worktreeId &&
    snapshot.worktreeRelativePath === input.worktreeBinding.relativePath &&
    snapshot.branchName === input.worktreeBinding.branchName &&
    snapshot.baseRevision === input.baseRevision &&
    samePaths(snapshot.writeSet, input.writeSet)
  );
}

function samePaths(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((path, index) => path === right[index]);
}

/** 新鲜 Snapshot 现场复验的内部封闭结果。 */
export enum FreshRecoverySnapshotOutcome {
  /** Snapshot 已通过完整摘要与身份复验。 */
  Verified = "verified",
  /** Snapshot 已返回但与权威输入或持久化摘要漂移。 */
  Drift = "drift",
  /** Snapshot 端口未能证明结果。 */
  Unknown = "unknown",
}

/** 新鲜 Snapshot 复验的内部结果。 */
export interface FreshRecoverySnapshotCheck {
  /** 内部复验分类。 */
  readonly outcome: FreshRecoverySnapshotOutcome;
  /** 仅在 Verified 时存在的完整 Snapshot。 */
  readonly snapshot?: CodingTaskSessionChangeSetSnapshot;
}
