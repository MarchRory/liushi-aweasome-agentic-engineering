import type { CommandInvocationProvenance } from "#application/command/index.js";
import type { SessionHookBinding } from "#application/executorHooks/index.js";
import {
  createActionTrace,
  HarnessHookEvent,
  type SessionPostActionHookPayload,
  type SessionPreActionHookPayload,
} from "#application/hooks/index.js";
import type { ContentDigestPort } from "#application/ports/index.js";
import {
  ActorKind,
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  parseContentDigest,
  success,
  type HarnessError as HarnessErrorType,
  type Result,
} from "#common/index.js";
import {
  SESSION_ACTION_JOURNAL_SCHEMA_VERSION,
  ActionJournalStatus,
  type ActionJournalState,
  type SessionActionIntentRecord,
  type SessionActionProvenance,
} from "#domain/actionJournal/index.js";
import type {
  CodingTaskSessionActivationRecord,
  CodingTaskSessionAdmissionState,
} from "#domain/codingTaskSession/index.js";

/** 复验 Binding、Activation、Admission State 与调用来源并生成 Session provenance。 */
export function validateSessionActionAdmissionContext(
  payload: SessionPreActionHookPayload | SessionPostActionHookPayload,
  binding: SessionHookBinding,
  activation: CodingTaskSessionActivationRecord,
  state: CodingTaskSessionAdmissionState,
  invocation: CommandInvocationProvenance,
  digest: ContentDigestPort,
): Result<SessionActionProvenance, HarnessErrorType> {
  const rootDigest = digest.calculate({ worktreeRoot: binding.workspaceRoot });
  if (rootDigest.status === ResultStatus.Failure) return rootDigest;
  const executorSessionIdDigest = digest.calculate(payload.sessionId);
  if (executorSessionIdDigest.status === ResultStatus.Failure) return executorSessionIdDigest;
  const invocationId = digest.calculate({
    executor: invocation.executor,
    sessionIdDigest: invocation.sessionIdDigest,
    turnIdDigest: invocation.turnIdDigest,
    toolCallIdDigest: invocation.toolCallIdDigest,
    toolName: invocation.toolName,
  });
  if (invocationId.status === ResultStatus.Failure) return invocationId;
  const sessionBindingDigest = parseContentDigest(binding.sessionBindingDigest);
  if (sessionBindingDigest.status === ResultStatus.Failure) return sessionBindingDigest;

  if (
    binding.workspaceId !== activation.workspaceId ||
    binding.taskId !== activation.sourceTaskId ||
    binding.sessionId !== activation.sessionId ||
    binding.codingTaskId !== activation.codingTaskId ||
    binding.attemptNumber !== activation.attemptNumber ||
    binding.worktreeId !== activation.worktreeId ||
    binding.worktreeRootDigest !== activation.worktreeRootDigest ||
    binding.activationBindingDigest !== activation.bindingDigest ||
    binding.planRiskArtifactId !== activation.planRiskArtifactId ||
    binding.planRiskArtifactDigest !== activation.planRiskArtifactDigest ||
    binding.actorId !== activation.agentActorId ||
    binding.boundAt !== activation.activatedAt ||
    rootDigest.value !== activation.worktreeRootDigest
  ) {
    return denied("Session Hook Binding v2 与权威 Activation Record 不一致。");
  }
  if (
    state.workspaceId !== activation.workspaceId ||
    state.sessionId !== activation.sessionId ||
    state.activationBindingDigest !== activation.bindingDigest ||
    state.sessionBindingDigest !== binding.sessionBindingDigest
  ) {
    return denied("Admission State 与 Session Binding 身份不一致。");
  }
  if (
    payload.workspaceId !== activation.workspaceId ||
    payload.taskId !== activation.sourceTaskId ||
    payload.sessionContext.sessionId !== activation.sessionId ||
    payload.sessionContext.sessionBindingDigest !== binding.sessionBindingDigest ||
    payload.actor.kind !== ActorKind.Agent ||
    payload.actor.actorId !== activation.agentActorId ||
    payload.executor.toString() !== invocation.executor ||
    invocation.sessionIdDigest !== executorSessionIdDigest.value ||
    invocation.invocationId !== invocationId.value
  ) {
    return denied("Session Hook Payload 或调用来源证明与权威绑定不一致。");
  }
  if (payload.event === HarnessHookEvent.PreAction) {
    const targetsDigest = digest.calculate(payload.targets);
    if (targetsDigest.status === ResultStatus.Failure) return targetsDigest;
    if (
      payload.planRiskArtifactId !== activation.planRiskArtifactId ||
      payload.planRiskArtifactDigest !== activation.planRiskArtifactDigest ||
      invocation.targetsDigest !== targetsDigest.value ||
      invocation.inputDigest !== payload.inputDigest
    ) {
      return denied("Session PreAction 的 PlanRisk、Targets 或 Input Digest 不一致。");
    }
  } else if (
    payload.toolName !== invocation.toolName ||
    payload.toolCallId !== invocation.toolCallIdDigest
  ) {
    return denied("Session PostAction 的 Tool 来源与调用证明不一致。");
  }

  return success({
    sessionId: activation.sessionId,
    codingTaskId: activation.codingTaskId,
    attemptNumber: activation.attemptNumber,
    worktreeId: activation.worktreeId,
    worktreeRootDigest: activation.worktreeRootDigest,
    activationBindingDigest: activation.bindingDigest,
    sessionBindingDigest: sessionBindingDigest.value,
    executorSessionIdDigest: executorSessionIdDigest.value,
  });
}

/** 复验 Session PostAction 与既有 v2 Intent 的全部不可变身份。 */
export function validateSessionPostActionIntent(
  payload: SessionPostActionHookPayload,
  invocation: CommandInvocationProvenance,
  state: ActionJournalState,
  provenance: SessionActionProvenance,
  digest: ContentDigestPort,
): Result<SessionActionIntentRecord, HarnessErrorType> {
  if (state.intent.schemaVersion !== SESSION_ACTION_JOURNAL_SCHEMA_VERSION) {
    return denied("Session PostAction 不得复用 legacy Action Intent。");
  }
  const intent = state.intent;
  const targetsDigest = digest.calculate(intent.targets);
  if (targetsDigest.status === ResultStatus.Failure) return targetsDigest;
  if (
    payload.actionId !== intent.actionId ||
    payload.causationId !== intent.commandId ||
    payload.correlationId !== intent.correlationId ||
    payload.actor.kind !== intent.actor.kind ||
    payload.actor.actorId !== intent.actor.actorId ||
    invocation.targetsDigest !== targetsDigest.value ||
    invocation.inputDigest !== intent.inputDigest ||
    !sameSessionProvenance(intent.sessionProvenance, provenance)
  ) {
    return denied("Session PostAction 与已准入 Intent 的因果、输入或 provenance 不一致。");
  }
  return success(intent);
}

/** 在任何新 Trace 副作用前复验已闭合 PostAction 是否为精确幂等重放。 */
export function validateSessionPostActionReplay(
  payload: SessionPostActionHookPayload,
  state: ActionJournalState,
  digest: ContentDigestPort,
): Result<boolean, HarnessErrorType> {
  if (![ActionJournalStatus.Committed, ActionJournalStatus.Recovered].includes(state.status)) {
    return success(false);
  }
  const observation = state.observations.at(-1);
  if (
    observation === undefined ||
    observation.schemaVersion !== SESSION_ACTION_JOURNAL_SCHEMA_VERSION ||
    observation.trace.observationDigest === undefined
  ) {
    return denied("已闭合 PostAction 缺少可复验的 Trace 摘要。");
  }
  const traceDigest = digest.calculate(createActionTrace(payload));
  if (traceDigest.status === ResultStatus.Failure) return traceDigest;
  const matches =
    observation.actionId === payload.actionId &&
    observation.workspaceId === payload.workspaceId &&
    observation.taskId === payload.taskId &&
    observation.outcome === payload.outcome &&
    observation.outputDigest === payload.outputDigest &&
    observation.errorCode === payload.errorCode &&
    observation.actor.kind === payload.actor.kind &&
    observation.actor.actorId === payload.actor.actorId &&
    observation.recordedAt === payload.occurredAt &&
    sameStrings(observation.evidenceIds, payload.evidenceIds) &&
    observation.trace.observationDigest === traceDigest.value;
  return matches ? success(true) : denied("已闭合 PostAction 与本次重放内容不一致。");
}

function sameSessionProvenance(
  left: SessionActionProvenance,
  right: SessionActionProvenance,
): boolean {
  return (
    left.sessionId === right.sessionId &&
    left.codingTaskId === right.codingTaskId &&
    left.attemptNumber === right.attemptNumber &&
    left.worktreeId === right.worktreeId &&
    left.worktreeRootDigest === right.worktreeRootDigest &&
    left.activationBindingDigest === right.activationBindingDigest &&
    left.sessionBindingDigest === right.sessionBindingDigest &&
    left.executorSessionIdDigest === right.executorSessionIdDigest
  );
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function denied(message: string): Result<never, HarnessErrorType> {
  return failure(new HarnessError(HarnessErrorCode.OperationForbidden, message));
}
