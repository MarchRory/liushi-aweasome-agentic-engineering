import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import type { ContentDigestPort } from "#application/ports/contentDigest/index.js";

import type { CodingTaskSessionCloseoutState } from "../contracts/index.js";
import { CodingTaskSessionCloseoutStage, CodingTaskSessionCloseoutStatus } from "../enums/index.js";
import { validateCloseoutCoverageBinding } from "./codingTaskSessionCloseoutCoverageValidation.js";

/** 验证 Closeout 阶段、版本、证据和时间的不变量。 */
export function validateCloseoutStateInvariants(
  state: CodingTaskSessionCloseoutState,
  digestPort: ContentDigestPort,
): Result<void, HarnessError> {
  const coverage = validateCloseoutCoverageBinding(state, digestPort);
  if (coverage.status === ResultStatus.Failure) return coverage;
  const hasSnapshot = state.snapshot !== null;
  const hasCoverage = state.coverageManifest !== null && state.coverageBindingDigest !== null;
  if (hasSnapshot && state.snapshot.repositoryId !== state.repositoryId) {
    return failure(invariant("Snapshot Repository 身份漂移。"));
  }
  if (state.checkpoint !== null && (state.snapshot === null || !sameCheckpointBinding(state))) {
    return failure(invariant("Checkpoint 必须与完整 Snapshot 双向绑定。"));
  }
  if (Date.parse(state.updatedAt) < Date.parse(state.createdAt)) {
    return failure(invariant("updatedAt 不得早于 createdAt。"));
  }

  switch (state.status) {
    case CodingTaskSessionCloseoutStatus.Closing:
      return validateClosing(state, hasSnapshot, hasCoverage);
    case CodingTaskSessionCloseoutStatus.SnapshotPersisted:
      return validateSnapshotPersisted(state, hasSnapshot, hasCoverage);
    case CodingTaskSessionCloseoutStatus.CheckpointBound:
      return validateCheckpointBound(state, hasSnapshot, hasCoverage);
    case CodingTaskSessionCloseoutStatus.Blocked:
    case CodingTaskSessionCloseoutStatus.OutcomeUnknown:
      return validateTerminal(state, hasSnapshot, hasCoverage);
  }
}

/** 冻结 State 自有的可变嵌套字段。 */
export function freezeCloseoutState(
  state: CodingTaskSessionCloseoutState,
): CodingTaskSessionCloseoutState {
  const { causationId, ...required } = state;
  return Object.freeze({
    ...required,
    ...(causationId === undefined ? {} : { causationId }),
    actor: Object.freeze({ ...state.actor }),
  });
}

function validateClosing(
  state: CodingTaskSessionCloseoutState,
  hasSnapshot: boolean,
  hasCoverage: boolean,
): Result<void, HarnessError> {
  return state.version === 0 &&
    state.updatedAt === state.createdAt &&
    !hasSnapshot &&
    !hasCoverage &&
    state.checkpoint === null &&
    hasNoTerminalDetails(state)
    ? success(undefined)
    : failure(invariant("Closing 只能是 version=0 的初始状态。"));
}

function validateSnapshotPersisted(
  state: CodingTaskSessionCloseoutState,
  hasSnapshot: boolean,
  hasCoverage: boolean,
): Result<void, HarnessError> {
  return state.version === 1 &&
    hasSnapshot &&
    hasCoverage &&
    state.checkpoint === null &&
    hasNoTerminalDetails(state)
    ? success(undefined)
    : failure(invariant("SnapshotPersisted 必须是 version=1 且保留完整 Coverage 证据。"));
}

function validateCheckpointBound(
  state: CodingTaskSessionCloseoutState,
  hasSnapshot: boolean,
  hasCoverage: boolean,
): Result<void, HarnessError> {
  return state.version === 2 &&
    hasSnapshot &&
    hasCoverage &&
    state.checkpoint !== null &&
    hasNoTerminalDetails(state)
    ? success(undefined)
    : failure(invariant("CheckpointBound 必须是 version=2 且保留完整绑定。"));
}

function validateTerminal(
  state: CodingTaskSessionCloseoutState,
  hasSnapshot: boolean,
  hasCoverage: boolean,
): Result<void, HarnessError> {
  if (state.stoppedStage === null || state.errorCode === null || state.recoveryGuidance === null) {
    return failure(invariant("终止状态必须保留完整停止信息。"));
  }
  const matchesStage =
    state.stoppedStage === CodingTaskSessionCloseoutStage.Closing
      ? state.version === 1 && !hasSnapshot && !hasCoverage && state.checkpoint === null
      : state.stoppedStage === CodingTaskSessionCloseoutStage.SnapshotPersisted
        ? state.version === 2 && hasSnapshot && hasCoverage && state.checkpoint === null
        : state.version === 3 && hasSnapshot && hasCoverage && state.checkpoint !== null;
  return matchesStage
    ? success(undefined)
    : failure(invariant("终止状态与停止阶段的版本或证据不一致。"));
}

function hasNoTerminalDetails(state: CodingTaskSessionCloseoutState): boolean {
  return state.stoppedStage === null && state.errorCode === null && state.recoveryGuidance === null;
}

function sameCheckpointBinding(state: CodingTaskSessionCloseoutState): boolean {
  const snapshot = state.snapshot;
  const checkpoint = state.checkpoint;
  return (
    snapshot !== null &&
    checkpoint !== null &&
    checkpoint.changeSetDigest === snapshot.changeSetDigest &&
    checkpoint.preSubmitSnapshotDigest === snapshot.snapshotDigest &&
    checkpoint.checkpoint.changedPaths.length === snapshot.changedPaths.length &&
    checkpoint.checkpoint.changedPaths.every((path, index) => path === snapshot.changedPaths[index])
  );
}

function invariant(message: string): HarnessError {
  return new HarnessError(HarnessErrorCode.InvalidStateTransition, message);
}
