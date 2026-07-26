import {
  ChangeSetCheckpointRecoveryStatus,
  type ChangeSetCheckpointInput,
  type ChangeSetCheckpointRecoveryAssessment,
} from "#application/changeSetCheckpoint/index.js";
import {
  createCheckpointInput,
  type CodingTaskSessionCloseoutAuthority,
} from "#application/codingTaskSessionCloseout/index.js";
import {
  CodingTaskSessionCloseoutStage,
  CodingTaskSessionCloseoutStatus,
  type CodingTaskSessionCloseoutState,
} from "#application/codingTaskSessionCloseoutState/index.js";
import { HarnessErrorCode } from "#common/index.js";

import {
  CodingTaskSessionCloseoutRecoveryDiagnostic,
  CodingTaskSessionCloseoutRecoveryDisposition,
  CodingTaskSessionCloseoutRecoveryResolution,
} from "../../enums/index.js";
import type { CodingTaskSessionCloseoutRecoveryAssessmentServiceDependencies } from "../contracts/index.js";
import {
  assessRecoveryCheckpoint,
  FreshRecoverySnapshotOutcome,
  hasSameRecoveryCheckpoint,
  inspectFreshRecoverySnapshot,
  unknownRecoveryCheckpoint,
} from "./codingTaskSessionCloseoutRecoveryEvidence.service.js";

/** 一次 Closeout Recovery 分类所需的封闭决策。 */
export interface CodingTaskSessionCloseoutRecoveryDecision {
  /** 未来 Human Command 可复用的确定性 Checkpoint 输入。 */
  readonly checkpointInput: ChangeSetCheckpointInput | null;
  /** 只读 Checkpoint Recovery 三态。 */
  readonly checkpointRecovery: ChangeSetCheckpointRecoveryAssessment;
  /** 当前公开处置结果。 */
  readonly disposition: CodingTaskSessionCloseoutRecoveryDisposition;
  /** 当前唯一可行 Resolution。 */
  readonly allowedResolution: CodingTaskSessionCloseoutRecoveryResolution | null;
  /** 当前公开稳定诊断。 */
  readonly diagnostic: CodingTaskSessionCloseoutRecoveryDiagnostic;
}

/** 按 Closeout 状态、阶段、错误码与只读现场证据执行严格分类。 */
export async function classifyCodingTaskSessionCloseoutRecovery(
  dependencies: CodingTaskSessionCloseoutRecoveryAssessmentServiceDependencies,
  state: CodingTaskSessionCloseoutState,
  authority: CodingTaskSessionCloseoutAuthority,
): Promise<CodingTaskSessionCloseoutRecoveryDecision> {
  const baseInput =
    state.snapshot === null ? null : createCheckpointInput(authority, state.snapshot);
  const humanStage = humanDecision(
    baseInput,
    CodingTaskSessionCloseoutRecoveryDiagnostic.CloseoutStageNotAllowed,
  );
  if (state.status === CodingTaskSessionCloseoutStatus.Closing) return humanStage;
  if (
    state.status === CodingTaskSessionCloseoutStatus.Blocked &&
    state.stoppedStage === CodingTaskSessionCloseoutStage.SnapshotPersisted
  ) {
    if (state.errorCode !== HarnessErrorCode.CodingTaskSessionCloseoutCheckpointNotApplied) {
      return humanDecision(
        baseInput,
        CodingTaskSessionCloseoutRecoveryDiagnostic.CloseoutErrorNotAllowed,
      );
    }
    return classifyRetry(dependencies, state, authority, baseInput);
  }
  if (
    state.status === CodingTaskSessionCloseoutStatus.OutcomeUnknown &&
    state.stoppedStage === CodingTaskSessionCloseoutStage.SnapshotPersisted
  ) {
    return classifySnapshotPersistedBind(dependencies, baseInput);
  }
  if (
    state.status === CodingTaskSessionCloseoutStatus.OutcomeUnknown &&
    state.stoppedStage === CodingTaskSessionCloseoutStage.CheckpointBound
  ) {
    return classifyCheckpointBoundBind(dependencies, state, baseInput);
  }
  return humanStage;
}
async function classifyRetry(
  dependencies: CodingTaskSessionCloseoutRecoveryAssessmentServiceDependencies,
  state: CodingTaskSessionCloseoutState,
  authority: CodingTaskSessionCloseoutAuthority,
  baseInput: ChangeSetCheckpointInput | null,
): Promise<CodingTaskSessionCloseoutRecoveryDecision> {
  if (state.snapshot === null || baseInput === null) {
    return humanDecision(baseInput, CodingTaskSessionCloseoutRecoveryDiagnostic.SnapshotUnknown);
  }
  const checkpointRecovery = await assessRecoveryCheckpoint(dependencies, baseInput);
  if (checkpointRecovery.status !== ChangeSetCheckpointRecoveryStatus.Absent) {
    return {
      checkpointInput: baseInput,
      checkpointRecovery,
      disposition: CodingTaskSessionCloseoutRecoveryDisposition.HumanRequired,
      allowedResolution: null,
      diagnostic:
        checkpointRecovery.status === ChangeSetCheckpointRecoveryStatus.Unknown
          ? CodingTaskSessionCloseoutRecoveryDiagnostic.CheckpointUnknown
          : CodingTaskSessionCloseoutRecoveryDiagnostic.CheckpointUnexpected,
    };
  }
  const fresh = await inspectFreshRecoverySnapshot(dependencies, authority);
  if (fresh.outcome !== FreshRecoverySnapshotOutcome.Verified || fresh.snapshot === undefined) {
    return humanDecision(
      baseInput,
      fresh.outcome === FreshRecoverySnapshotOutcome.Drift
        ? CodingTaskSessionCloseoutRecoveryDiagnostic.SnapshotDrift
        : CodingTaskSessionCloseoutRecoveryDiagnostic.SnapshotUnknown,
      checkpointRecovery,
    );
  }
  if (fresh.snapshot.snapshotDigest !== state.snapshot.snapshotDigest) {
    return humanDecision(
      baseInput,
      CodingTaskSessionCloseoutRecoveryDiagnostic.SnapshotDrift,
      checkpointRecovery,
    );
  }
  const checkpointInput = createCheckpointInput(authority, fresh.snapshot);
  return {
    checkpointInput,
    checkpointRecovery,
    disposition: CodingTaskSessionCloseoutRecoveryDisposition.ResolutionAvailable,
    allowedResolution: CodingTaskSessionCloseoutRecoveryResolution.RetryOnce,
    diagnostic: CodingTaskSessionCloseoutRecoveryDiagnostic.RetryAvailable,
  };
}
async function classifySnapshotPersistedBind(
  dependencies: CodingTaskSessionCloseoutRecoveryAssessmentServiceDependencies,
  checkpointInput: ChangeSetCheckpointInput | null,
): Promise<CodingTaskSessionCloseoutRecoveryDecision> {
  if (checkpointInput === null)
    return humanDecision(null, CodingTaskSessionCloseoutRecoveryDiagnostic.CheckpointUnknown);
  const checkpointRecovery = await assessRecoveryCheckpoint(dependencies, checkpointInput);
  return checkpointRecovery.status === ChangeSetCheckpointRecoveryStatus.Present
    ? {
        checkpointInput,
        checkpointRecovery,
        disposition: CodingTaskSessionCloseoutRecoveryDisposition.ResolutionAvailable,
        allowedResolution: CodingTaskSessionCloseoutRecoveryResolution.BindExisting,
        diagnostic: CodingTaskSessionCloseoutRecoveryDiagnostic.BindExistingAvailable,
      }
    : humanDecision(
        checkpointInput,
        checkpointRecovery.status === ChangeSetCheckpointRecoveryStatus.Unknown
          ? CodingTaskSessionCloseoutRecoveryDiagnostic.CheckpointUnknown
          : CodingTaskSessionCloseoutRecoveryDiagnostic.CheckpointMissing,
        checkpointRecovery,
      );
}
async function classifyCheckpointBoundBind(
  dependencies: CodingTaskSessionCloseoutRecoveryAssessmentServiceDependencies,
  state: CodingTaskSessionCloseoutState,
  checkpointInput: ChangeSetCheckpointInput | null,
): Promise<CodingTaskSessionCloseoutRecoveryDecision> {
  if (state.checkpoint === null || checkpointInput === null) {
    return humanDecision(null, CodingTaskSessionCloseoutRecoveryDiagnostic.CheckpointUnknown);
  }
  const checkpointRecovery = await assessRecoveryCheckpoint(dependencies, checkpointInput);
  if (checkpointRecovery.status !== ChangeSetCheckpointRecoveryStatus.Present) {
    return humanDecision(
      checkpointInput,
      checkpointRecovery.status === ChangeSetCheckpointRecoveryStatus.Unknown
        ? CodingTaskSessionCloseoutRecoveryDiagnostic.CheckpointUnknown
        : CodingTaskSessionCloseoutRecoveryDiagnostic.CheckpointMissing,
      checkpointRecovery,
    );
  }
  const matches = hasSameRecoveryCheckpoint(checkpointRecovery, state.checkpoint);
  return {
    checkpointInput,
    checkpointRecovery,
    disposition: matches
      ? CodingTaskSessionCloseoutRecoveryDisposition.ResolutionAvailable
      : CodingTaskSessionCloseoutRecoveryDisposition.HumanRequired,
    allowedResolution: matches ? CodingTaskSessionCloseoutRecoveryResolution.BindExisting : null,
    diagnostic: matches
      ? CodingTaskSessionCloseoutRecoveryDiagnostic.BindExistingAvailable
      : CodingTaskSessionCloseoutRecoveryDiagnostic.CheckpointMismatch,
  };
}
function humanDecision(
  checkpointInput: ChangeSetCheckpointInput | null,
  diagnostic: CodingTaskSessionCloseoutRecoveryDiagnostic,
  checkpointRecovery: ChangeSetCheckpointRecoveryAssessment = unknownRecoveryCheckpoint(),
): CodingTaskSessionCloseoutRecoveryDecision {
  return {
    checkpointInput,
    checkpointRecovery,
    disposition: CodingTaskSessionCloseoutRecoveryDisposition.HumanRequired,
    allowedResolution: null,
    diagnostic,
  };
}
