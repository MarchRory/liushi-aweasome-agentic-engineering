import type { ContentDigestPort } from "#application/ports/contentDigest/index.js";
import { ResultStatus, failure } from "#common/index.js";

import type { CodingTaskSessionCloseoutRecoveryStateResult } from "../contracts/index.js";
import { CodingTaskSessionCloseoutRecoveryResolution } from "#application/codingTaskSessionCloseoutRecovery/enums/index.js";
import { CodingTaskSessionCloseoutRecoveryStateStatus } from "../enums/index.js";
import {
  evolveRecoveryState,
  parseCheckpointInput,
  parseRecoveryState,
  parseTerminalInput,
  parseTimestamp,
} from "./codingTaskSessionCloseoutRecoveryStateTransitionSupport.js";
import { invalidTransition } from "../validation/index.js";

/** 将 Approved 的 RetryOnce 决策推进为已持久化 Executing Intent。 */
export function markCodingTaskSessionCloseoutRecoveryExecuting(
  stateInput: unknown,
  input: unknown,
  digestPort: ContentDigestPort,
): CodingTaskSessionCloseoutRecoveryStateResult {
  const state = parseRecoveryState(stateInput, digestPort);
  if (state.status === ResultStatus.Failure) return state;
  if (
    state.value.status !== CodingTaskSessionCloseoutRecoveryStateStatus.Approved ||
    state.value.requestedResolution !== CodingTaskSessionCloseoutRecoveryResolution.RetryOnce
  ) {
    return failure(invalidTransition("只有 Approved + RetryOnce 可以进入 Executing。"));
  }
  const timestamp = parseTimestamp(input);
  if (timestamp.status === ResultStatus.Failure) return timestamp;
  return evolveRecoveryState(
    state.value,
    {
      status: CodingTaskSessionCloseoutRecoveryStateStatus.Executing,
      checkpoint: null,
      errorCode: null,
      recoveryGuidance: null,
      updatedAt: timestamp.value,
    },
    digestPort,
  );
}

/** 将 Approved + BindExisting 直接推进为 CheckpointBound。 */
export function bindExistingCodingTaskSessionCloseoutRecoveryCheckpoint(
  stateInput: unknown,
  input: unknown,
  digestPort: ContentDigestPort,
): CodingTaskSessionCloseoutRecoveryStateResult {
  const state = parseRecoveryState(stateInput, digestPort);
  if (state.status === ResultStatus.Failure) return state;
  if (
    state.value.status !== CodingTaskSessionCloseoutRecoveryStateStatus.Approved ||
    state.value.requestedResolution !== CodingTaskSessionCloseoutRecoveryResolution.BindExisting
  ) {
    return failure(invalidTransition("只有 Approved + BindExisting 可以直接绑定 Checkpoint。"));
  }
  const checkpoint = parseCheckpointInput(input, digestPort);
  if (checkpoint.status === ResultStatus.Failure) return checkpoint;
  return evolveRecoveryState(
    state.value,
    {
      status: CodingTaskSessionCloseoutRecoveryStateStatus.CheckpointBound,
      checkpoint: checkpoint.value.checkpoint,
      errorCode: null,
      recoveryGuidance: null,
      updatedAt: checkpoint.value.updatedAt,
    },
    digestPort,
  );
}

/** 将 Executing + RetryOnce 的成功检查结果推进为 CheckpointBound。 */
export function bindRetriedCodingTaskSessionCloseoutRecoveryCheckpoint(
  stateInput: unknown,
  input: unknown,
  digestPort: ContentDigestPort,
): CodingTaskSessionCloseoutRecoveryStateResult {
  const state = parseRecoveryState(stateInput, digestPort);
  if (state.status === ResultStatus.Failure) return state;
  if (
    state.value.status !== CodingTaskSessionCloseoutRecoveryStateStatus.Executing ||
    state.value.requestedResolution !== CodingTaskSessionCloseoutRecoveryResolution.RetryOnce
  ) {
    return failure(invalidTransition("只有 Executing + RetryOnce 可以绑定重试 Checkpoint。"));
  }
  const checkpoint = parseCheckpointInput(input, digestPort);
  if (checkpoint.status === ResultStatus.Failure) return checkpoint;
  return evolveRecoveryState(
    state.value,
    {
      status: CodingTaskSessionCloseoutRecoveryStateStatus.CheckpointBound,
      checkpoint: checkpoint.value.checkpoint,
      errorCode: null,
      recoveryGuidance: null,
      updatedAt: checkpoint.value.updatedAt,
    },
    digestPort,
  );
}

/** 记录 RetryOnce 已被证明没有应用 Checkpoint。 */
export function markCodingTaskSessionCloseoutRecoveryRetryNotApplied(
  stateInput: unknown,
  input: unknown,
  digestPort: ContentDigestPort,
): CodingTaskSessionCloseoutRecoveryStateResult {
  return markRetryTerminal(
    stateInput,
    input,
    CodingTaskSessionCloseoutRecoveryStateStatus.RetryNotApplied,
    digestPort,
  );
}

/** 记录 RetryOnce 的执行或持久化结果无法证明。 */
export function markCodingTaskSessionCloseoutRecoveryOutcomeUnknown(
  stateInput: unknown,
  input: unknown,
  digestPort: ContentDigestPort,
): CodingTaskSessionCloseoutRecoveryStateResult {
  return markRetryTerminal(
    stateInput,
    input,
    CodingTaskSessionCloseoutRecoveryStateStatus.OutcomeUnknown,
    digestPort,
  );
}

/** 记录现场或执行复核需要 Human 重新决策。 */
export function requireHumanForCodingTaskSessionCloseoutRecovery(
  stateInput: unknown,
  input: unknown,
  digestPort: ContentDigestPort,
): CodingTaskSessionCloseoutRecoveryStateResult {
  const state = parseRecoveryState(stateInput, digestPort);
  if (state.status === ResultStatus.Failure) return state;
  if (
    state.value.status !== CodingTaskSessionCloseoutRecoveryStateStatus.Approved &&
    state.value.status !== CodingTaskSessionCloseoutRecoveryStateStatus.Executing
  ) {
    return failure(invalidTransition("只有 Approved 或 Executing 可以进入 HumanRequired。"));
  }
  const terminal = parseTerminalInput(input);
  if (terminal.status === ResultStatus.Failure) return terminal;
  return evolveRecoveryState(
    state.value,
    {
      status: CodingTaskSessionCloseoutRecoveryStateStatus.HumanRequired,
      checkpoint: null,
      errorCode: terminal.value.errorCode,
      recoveryGuidance: terminal.value.recoveryGuidance,
      updatedAt: terminal.value.updatedAt,
    },
    digestPort,
  );
}

function markRetryTerminal(
  stateInput: unknown,
  input: unknown,
  status:
    | CodingTaskSessionCloseoutRecoveryStateStatus.RetryNotApplied
    | CodingTaskSessionCloseoutRecoveryStateStatus.OutcomeUnknown,
  digestPort: ContentDigestPort,
): CodingTaskSessionCloseoutRecoveryStateResult {
  const state = parseRecoveryState(stateInput, digestPort);
  if (state.status === ResultStatus.Failure) return state;
  if (
    state.value.status !== CodingTaskSessionCloseoutRecoveryStateStatus.Executing ||
    state.value.requestedResolution !== CodingTaskSessionCloseoutRecoveryResolution.RetryOnce
  ) {
    return failure(invalidTransition("只有 Executing + RetryOnce 可以记录重试结果。"));
  }
  const terminal = parseTerminalInput(input);
  if (terminal.status === ResultStatus.Failure) return terminal;
  return evolveRecoveryState(
    state.value,
    {
      status,
      checkpoint: null,
      errorCode: terminal.value.errorCode,
      recoveryGuidance: terminal.value.recoveryGuidance,
      updatedAt: terminal.value.updatedAt,
    },
    digestPort,
  );
}
