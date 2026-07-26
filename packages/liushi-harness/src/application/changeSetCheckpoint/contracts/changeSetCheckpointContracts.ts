import type { ActionExecutionResult } from "#application/actionExecution/index.js";
import type { GitCheckpoint, GitCheckpointInput } from "#application/ports/index.js";
import type { ContentDigest, HarnessError, Result } from "#common/index.js";
import type { CodingTaskSessionChangeSetSnapshot } from "#domain/codingTaskSessionChangeSet/index.js";

import type { CHANGE_SET_CHECKPOINT_SCHEMA_VERSION } from "../constants/index.js";
import type { ChangeSetCheckpointRecoveryStatus } from "../enums/index.js";

/** 创建或恢复 ChangeSet-bound Git Checkpoint 的输入。 */
export interface ChangeSetCheckpointInput {
  /** 既有单提交 Git Checkpoint 的完整输入。 */
  readonly checkpointInput: GitCheckpointInput;
  /** 副作用前已持久化并通过完整摘要验证的现场 Snapshot。 */
  readonly preSubmitSnapshot: CodingTaskSessionChangeSetSnapshot;
}

/** 已完成双向 ChangeSet 复验的 Git Checkpoint。 */
export interface ChangeSetCheckpoint {
  /** ChangeSet Checkpoint 契约版本。 */
  readonly schemaVersion: typeof CHANGE_SET_CHECKPOINT_SCHEMA_VERSION;
  /** 既有 Git Checkpoint 的权威投影。 */
  readonly checkpoint: GitCheckpoint;
  /** 提交前权威 ChangeSet 摘要。 */
  readonly changeSetDigest: ContentDigest;
  /** 提交前现场 Snapshot 摘要。 */
  readonly preSubmitSnapshotDigest: ContentDigest;
  /** Checkpoint、ChangeSet 与 Snapshot 的联合摘要。 */
  readonly bindingDigest: ContentDigest;
}

/** 由持有 Repository Lock 的调用方执行并支持只读恢复检查的 Checkpoint Port。 */
export interface ChangeSetCheckpointPort {
  /** 在 Repository Lock 内创建或幂等恢复一个与 ChangeSet 双向绑定的 Git Checkpoint。 */
  execute(input: ChangeSetCheckpointInput): Promise<Result<ActionExecutionResult, HarnessError>>;
  /** 在 Repository Lock 内只读重建并验证已存在的 ChangeSet-bound Checkpoint。 */
  inspect(input: ChangeSetCheckpointInput): Promise<Result<ChangeSetCheckpoint, HarnessError>>;
}

/** 已证明当前不存在 ChangeSet-bound Checkpoint 的恢复评估。 */
export interface AbsentChangeSetCheckpointRecoveryAssessment {
  /** 恢复评估的封闭三态。 */
  readonly status: ChangeSetCheckpointRecoveryStatus.Absent;
}

/** 已完成完整复验并携带 Checkpoint 的恢复评估。 */
export interface PresentChangeSetCheckpointRecoveryAssessment {
  /** 恢复评估的封闭三态。 */
  readonly status: ChangeSetCheckpointRecoveryStatus.Present;
  /** 已完成 ChangeSet、Snapshot 与 Git 状态复验的完整 Checkpoint。 */
  readonly checkpoint: ChangeSetCheckpoint;
}

/** 无法证明 ChangeSet-bound Checkpoint 状态的恢复评估。 */
export interface UnknownChangeSetCheckpointRecoveryAssessment {
  /** 恢复评估的封闭三态。 */
  readonly status: ChangeSetCheckpointRecoveryStatus.Unknown;
}

/** ChangeSet Checkpoint 恢复评估的严格判别联合。 */
export type ChangeSetCheckpointRecoveryAssessment =
  | AbsentChangeSetCheckpointRecoveryAssessment
  | PresentChangeSetCheckpointRecoveryAssessment
  | UnknownChangeSetCheckpointRecoveryAssessment;

/** 只读评估 ChangeSet-bound Checkpoint 的 sibling Port。 */
export interface ChangeSetCheckpointRecoveryPort {
  /** 只读区分不存在、已存在且已复验、无法证明三种状态。 */
  assess(
    input: ChangeSetCheckpointInput,
  ): Promise<Result<ChangeSetCheckpointRecoveryAssessment, HarnessError>>;
}
