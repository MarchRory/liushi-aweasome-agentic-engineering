import { z } from "zod";

import { parseCommandEnvelope } from "#application/command/index.js";
import type { ContentDigestPort } from "#application/ports/contentDigest/index.js";
import {
  ActorKind,
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import {
  CodingTaskPhase,
  CodingTaskRunState,
  assertCodingTaskExecutionAuthorization,
  type CodingTaskAggregateRecord,
} from "#domain/codingTask/index.js";
import {
  parseCodingTaskSessionId,
  type CodingTaskSessionActivationRecord,
  type CodingTaskSessionId,
} from "#domain/codingTaskSession/index.js";
import type { SessionHookBinding } from "#application/executorHooks/index.js";
import {
  parseRepositoryId,
  parseWorkspaceId,
  type RepositoryId,
  type WorkspaceId,
} from "#domain/workspace/index.js";

import {
  CODING_TASK_SESSION_CLOSEOUT_AGGREGATE_TYPE,
  CODING_TASK_SESSION_CLOSEOUT_COMMAND_TYPE,
} from "../constants/index.js";
import type {
  CodingTaskSessionCloseoutAuthority,
  CodingTaskSessionCloseoutCommand,
  CodingTaskSessionCloseoutPayload,
} from "../contracts/index.js";

const payloadSchema = z
  .object({
    workspaceId: z.string().min(1).max(256),
    sessionId: z.string().min(1).max(256),
  })
  .strict();

/** 先解析通用 Envelope，再严格解析 Closeout Payload 和固定命令元数据。 */
export function parseCodingTaskSessionCloseoutCommand(
  input: unknown,
  digest: ContentDigestPort,
): Result<CodingTaskSessionCloseoutCommand, HarnessError> {
  const envelope = parseCommandEnvelope(input);
  if (envelope.status === ResultStatus.Failure) return envelope;
  if (
    envelope.value.commandType !== CODING_TASK_SESSION_CLOSEOUT_COMMAND_TYPE ||
    envelope.value.aggregateType !== CODING_TASK_SESSION_CLOSEOUT_AGGREGATE_TYPE ||
    envelope.value.expectedVersion !== 0
  ) {
    return invalid("Closeout Command 的 type、aggregateType 或 expectedVersion 不符合固定契约。");
  }
  if (envelope.value.actor.kind !== ActorKind.Agent) {
    return invalid("Closeout Command 必须由 Agent Actor 发起。");
  }
  if (!isCanonicalIsoUtc(envelope.value.submittedAt)) {
    return invalid("Closeout Command submittedAt 必须是规范 UTC 时间。");
  }
  const payload = payloadSchema.safeParse(envelope.value.payload);
  if (!payload.success)
    return invalid("Closeout Payload 只允许 workspaceId 和 sessionId。", payload.error);
  const workspaceId = parseWorkspaceId(payload.data.workspaceId);
  if (workspaceId.status === ResultStatus.Failure) return workspaceId;
  const sessionId = parseCodingTaskSessionId(payload.data.sessionId);
  if (sessionId.status === ResultStatus.Failure) return sessionId;
  if (envelope.value.aggregateId !== sessionId.value) {
    return invalid("Closeout aggregateId 必须等于 payload.sessionId。");
  }
  const normalizedPayload: CodingTaskSessionCloseoutPayload = {
    workspaceId: workspaceId.value,
    sessionId: sessionId.value,
  };
  const expectedDigest = digest.calculate(normalizedPayload);
  if (expectedDigest.status === ResultStatus.Failure) return expectedDigest;
  if (expectedDigest.value !== envelope.value.requestDigest) {
    return invalid("Closeout requestDigest 必须等于 canonical payload digest。");
  }
  return success({
    ...envelope.value,
    payload: normalizedPayload,
  });
}

/** 复验 Activation、Aggregate、Binding、Root、Attempt 与 Gate 的全部权威身份。 */
export function validateCodingTaskSessionCloseoutAuthority(input: {
  readonly command: CodingTaskSessionCloseoutCommand;
  readonly activation: CodingTaskSessionActivationRecord;
  readonly codingTask: CodingTaskAggregateRecord;
  readonly binding: SessionHookBinding;
  readonly repositoryRoot: string;
  readonly worktreeRoot: string;
  readonly digest: ContentDigestPort;
}): Result<CodingTaskSessionCloseoutAuthority, HarnessError> {
  const aggregate = input.codingTask.aggregate;
  if (
    input.command.payload.workspaceId !== input.activation.workspaceId ||
    input.command.payload.sessionId !== input.activation.sessionId ||
    input.command.actor.actorId !== input.activation.agentActorId ||
    aggregate.workspaceId !== input.activation.workspaceId ||
    aggregate.codingTaskId !== input.activation.codingTaskId ||
    aggregate.sourceTaskId !== input.activation.sourceTaskId ||
    aggregate.repositoryId !== input.activation.repositoryId
  ) {
    return precondition(
      "Closeout 的 Workspace、Session、CodingTask、SourceTask 或 Repository 身份漂移。",
    );
  }
  if (
    aggregate.phase !== CodingTaskPhase.Implementation ||
    aggregate.runState !== CodingTaskRunState.Active ||
    !aggregate.worktreeBinding.managed ||
    aggregate.worktreeBinding.worktreeId !== input.activation.worktreeId ||
    input.activation.planRiskArtifactId !== aggregate.executionAuthorization.planRisk.artifactId ||
    input.activation.planRiskArtifactDigest !==
      aggregate.executionAuthorization.planRisk.artifactDigest
  ) {
    return precondition(
      "CodingTask 当前不再满足 Closeout 的阶段、运行状态、Worktree 或 PlanRisk 绑定。",
    );
  }
  if (Date.parse(input.command.submittedAt) < Date.parse(input.activation.activatedAt)) {
    return precondition("Closeout Command 不能早于 Session Activation。");
  }
  try {
    assertCodingTaskExecutionAuthorization(aggregate.executionAuthorization);
  } catch (error) {
    return precondition("CodingTask 的 PlanRisk 或历史业务逻辑 Gate 已失效。", error);
  }
  const activeAttempts = aggregate.attempts.filter(
    (attempt) => attempt.finishedAt === undefined && attempt.outcome === undefined,
  );
  if (
    activeAttempts.length !== 1 ||
    activeAttempts[0]?.number !== input.activation.attemptNumber ||
    activeAttempts[0]?.startedAt !== input.activation.attemptStartedAt
  ) {
    return precondition("CodingTask 的 active attempt 已漂移或不再开放。");
  }
  const rootDigest = input.digest.calculate({ worktreeRoot: input.worktreeRoot });
  if (rootDigest.status === ResultStatus.Failure) return rootDigest;
  if (
    input.binding.workspaceRoot !== input.worktreeRoot ||
    rootDigest.value !== input.activation.worktreeRootDigest ||
    input.binding.worktreeRootDigest !== input.activation.worktreeRootDigest
  ) {
    return precondition("Managed Worktree Root 或其 digest 与 Activation 不一致。");
  }
  if (
    input.binding.workspaceId !== input.activation.workspaceId ||
    input.binding.taskId !== input.activation.sourceTaskId ||
    input.binding.sessionId !== input.activation.sessionId ||
    input.binding.codingTaskId !== input.activation.codingTaskId ||
    input.binding.attemptNumber !== input.activation.attemptNumber ||
    input.binding.worktreeId !== input.activation.worktreeId ||
    input.binding.activationBindingDigest !== input.activation.bindingDigest ||
    input.binding.planRiskArtifactId !== input.activation.planRiskArtifactId ||
    input.binding.planRiskArtifactDigest !== input.activation.planRiskArtifactDigest ||
    input.binding.actorId !== input.activation.agentActorId ||
    input.binding.boundAt !== input.activation.activatedAt
  ) {
    return precondition("Session Hook Binding 与 Activation 身份不一致。");
  }
  const repositoryId = parseRepositoryId(input.activation.repositoryId);
  const workspaceId = parseWorkspaceId(input.activation.workspaceId);
  if (repositoryId.status === ResultStatus.Failure) return repositoryId;
  if (workspaceId.status === ResultStatus.Failure) return workspaceId;
  return success({
    activation: input.activation,
    codingTask: input.codingTask,
    binding: input.binding,
    repositoryRoot: input.repositoryRoot,
    worktreeRoot: input.worktreeRoot,
  });
}

/** 比较 Closeout State 的完整不可变身份，避免覆盖其他命令或 Session。 */
export function hasSameCodingTaskSessionCloseoutCommandIdentity(
  state: CodingTaskSessionCloseoutAuthorityState,
  command: CodingTaskSessionCloseoutCommand,
  authority: CodingTaskSessionCloseoutAuthority,
): boolean {
  return (
    state.workspaceId === command.payload.workspaceId &&
    state.sessionId === command.payload.sessionId &&
    state.codingTaskId === authority.activation.codingTaskId &&
    state.sourceTaskId === authority.activation.sourceTaskId &&
    state.repositoryId === authority.activation.repositoryId &&
    state.attemptNumber === authority.activation.attemptNumber &&
    state.activationBindingDigest === authority.activation.bindingDigest &&
    state.sessionBindingDigest === authority.binding.sessionBindingDigest &&
    state.requestDigest === command.requestDigest &&
    state.idempotencyKey === command.idempotencyKey &&
    state.commandId === command.commandId &&
    state.correlationId === command.correlationId &&
    state.causationId === command.causationId &&
    state.actor.kind === command.actor.kind &&
    state.actor.actorId === command.actor.actorId
  );
}

/** 判断 Admission 关闭阶段的确定性前置失败是否可以记录为 Blocked。 */
export function isCodingTaskSessionCloseoutBlockingFailure(code: HarnessErrorCode): boolean {
  return [
    HarnessErrorCode.PreconditionNotMet,
    HarnessErrorCode.OperationForbidden,
    HarnessErrorCode.InvalidStateTransition,
    HarnessErrorCode.InvalidInput,
    HarnessErrorCode.CorruptStore,
    HarnessErrorCode.ActionNotFound,
    HarnessErrorCode.ActionConflict,
  ].includes(code);
}

/** 判断锁不可用是否发生在副作用前，供调用方直接返回可重试失败。 */
export function isCodingTaskSessionCloseoutRetryableLockFailure(code: HarnessErrorCode): boolean {
  return code === HarnessErrorCode.LockUnavailable;
}

/** 判断 Admission 是否已经进入不能安全重试的持久化或锁释放未知状态。 */
export function isCodingTaskSessionAdmissionOutcomeUnknownFailure(code: HarnessErrorCode): boolean {
  return [
    HarnessErrorCode.CodingTaskSessionAdmissionCommitOutcomeUnknown,
    HarnessErrorCode.CodingTaskSessionAdmissionLockReleaseUnknown,
    HarnessErrorCode.ActionJournalCommitOutcomeUnknown,
  ].includes(code);
}

/** 用于比较 Closeout 固定身份字段的最小 State 形状。 */
type CodingTaskSessionCloseoutAuthorityState = CodingTaskSessionCloseoutAuthorityStateShape;
/** Closeout State 身份字段的结构化比较视图。 */
type CodingTaskSessionCloseoutAuthorityStateShape = {
  readonly workspaceId: WorkspaceId;
  readonly sessionId: CodingTaskSessionId;
  readonly codingTaskId: string;
  readonly sourceTaskId: string;
  readonly repositoryId: RepositoryId;
  readonly attemptNumber: number;
  readonly activationBindingDigest: string;
  readonly sessionBindingDigest: string;
  readonly requestDigest: string;
  readonly idempotencyKey: string;
  readonly commandId: string;
  readonly correlationId: string;
  readonly causationId?: string;
  readonly actor: { readonly kind: ActorKind; readonly actorId: string };
};

function invalid(message: string, cause?: unknown): Result<never, HarnessError> {
  return failure(new HarnessError(HarnessErrorCode.InvalidInput, message, {}, cause));
}

function precondition(message: string, cause?: unknown): Result<never, HarnessError> {
  return failure(new HarnessError(HarnessErrorCode.PreconditionNotMet, message, {}, cause));
}

function isCanonicalIsoUtc(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value)) {
    return false;
  }
  const expected = value.includes(".") ? value : `${value.slice(0, -1)}.000Z`;
  return new Date(value).toISOString() === expected;
}
