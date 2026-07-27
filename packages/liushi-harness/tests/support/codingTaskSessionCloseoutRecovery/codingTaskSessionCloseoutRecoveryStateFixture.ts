import {
  CodingTaskSessionCloseoutRecoveryResolution,
  createCodingTaskSessionCloseoutRecoveryState,
  type CodingTaskSessionCloseoutRecoveryState,
} from "../../../src/application/codingTaskSessionCloseoutRecovery/index.js";
import {
  ActorKind,
  ResultStatus,
  type HarnessError,
  type Result,
} from "../../../src/common/index.js";
import {
  codingTask,
  checkpoint,
  digestOf,
  repository,
  session,
  sourceTask,
  workspace,
} from "../codingTaskSessionCloseout/index.js";

/** Recovery State 测试使用的固定创建时间。 */
export const recoveryCreatedAt = "2026-07-27T00:00:00.000Z";

/** 创建固定的 Approved Recovery State 输入。 */
export function recoveryStateInput(
  resolution: CodingTaskSessionCloseoutRecoveryResolution,
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  const currentCheckpoint = checkpoint();
  return {
    workspaceId: workspace,
    sessionId: session,
    codingTaskId: codingTask,
    sourceTaskId: sourceTask,
    repositoryId: repository,
    attemptNumber: 1,
    closeoutStateDigest: digestOf({ closeout: "terminal" }),
    closeoutVersion: 3,
    assessmentDigest: digestOf({ assessment: "recovery" }),
    preSubmitSnapshotDigest: currentCheckpoint.preSubmitSnapshotDigest,
    changeSetDigest: currentCheckpoint.changeSetDigest,
    assessmentCheckpointBindingDigest:
      resolution === CodingTaskSessionCloseoutRecoveryResolution.BindExisting
        ? currentCheckpoint.bindingDigest
        : null,
    requestDigest: digestOf({ command: "recovery", resolution }),
    requestedResolution: resolution,
    actor: { kind: ActorKind.Human, actorId: "recovery-reviewer" },
    commandId: "recovery-command",
    idempotencyKey: "recovery-idempotency-key",
    correlationId: "recovery-correlation",
    causationId: "recovery-causation",
    createdAt: recoveryCreatedAt,
    ...overrides,
  };
}

/** 创建固定 Recovery State 并在失败时让测试直接失败。 */
export function approvedRecoveryState(
  resolution: CodingTaskSessionCloseoutRecoveryResolution,
  overrides: Readonly<Record<string, unknown>> = {},
): CodingTaskSessionCloseoutRecoveryState {
  return unwrap(
    createCodingTaskSessionCloseoutRecoveryState(recoveryStateInput(resolution, overrides)),
  );
}

/** 创建固定的成功 Checkpoint 迁移输入。 */
export function checkpointInput(
  updatedAt: string = "2026-07-27T00:00:01.000Z",
): Record<string, unknown> {
  return { checkpoint: checkpoint(), updatedAt };
}

/** 创建固定的终态迁移输入。 */
export function terminalInput(updatedAt = "2026-07-27T00:00:02.000Z"): Record<string, unknown> {
  return {
    errorCode: "coding_task_session_closeout_checkpoint_outcome_unknown",
    recoveryGuidance: "等待 Human 复核并禁止再次执行。",
    updatedAt,
  };
}

/** 统一解包 Recovery State 测试结果。 */
export function unwrap<T>(result: Result<T, HarnessError>): T {
  if (result.status === ResultStatus.Failure) throw result.error;
  return result.value;
}
