import { isDeepStrictEqual } from "node:util";

import {
  ActorKind,
  CODING_TASK_AGGREGATE_TYPE,
  CODING_TASK_SESSION_DELIVERY_SUBMISSION_COMMAND_TYPE,
  COMMAND_ENVELOPE_SCHEMA_VERSION,
  CodingTaskSessionEffectiveCloseoutSource,
  CodingTaskSessionEffectiveCloseoutStatus,
  FailureTaxonomy,
  ResultStatus,
  parseCodingTaskDeliveryCompletionInput,
  success,
} from "../../../../dist/index.js";
import { ulid } from "ulid";

import { calculateDigest } from "../../digest/index.mjs";

const digestPort = Object.freeze({ calculate: (value) => success(calculateDigest(value)) });

/** 从已闭合的 Pilot 状态装配生产 Completion 输入。 */
export function createSessionCompletionInput(input) {
  const binding = createCompletionBinding(input);
  const deliveryCommandId = ulid();
  const submittedAt = input.submittedAt;
  const deliveryPayload = {
    workspaceId: binding.workspaceId,
    sessionId: binding.sessionId,
    expectedCheckpointBindingDigest: binding.checkpointBindingDigest,
    expectedEffectiveSource: binding.effectiveSource,
  };
  return validateSessionCompletionInput(
    {
      deliveryCommand: {
        schemaVersion: COMMAND_ENVELOPE_SCHEMA_VERSION,
        commandId: deliveryCommandId,
        commandType: CODING_TASK_SESSION_DELIVERY_SUBMISSION_COMMAND_TYPE,
        aggregateType: CODING_TASK_AGGREGATE_TYPE,
        aggregateId: binding.codingTaskId,
        expectedVersion: binding.expectedVersion,
        idempotencyKey: deliveryCommandId,
        requestDigest: calculateDigest(deliveryPayload),
        actor: { kind: ActorKind.Agent, actorId: binding.agentActorId },
        authorizationContext: {},
        correlationId: binding.correlationId,
        causationId: binding.closeoutCommandId,
        submittedAt,
        payload: deliveryPayload,
      },
      profileCompilation: {
        taskId: binding.taskId,
        artifactId: binding.profileArtifactId,
        report: globalThis.structuredClone(input.report),
      },
      ruleResolutionContext: binding.ruleResolutionContext,
      verification: {
        commandId: ulid(),
        idempotencyKey: ulid(),
        actionId: ulid(),
        verificationRunId: ulid(),
        planId: ulid(),
        actor: { kind: ActorKind.Agent, actorId: binding.agentActorId },
        authorizationContext: {},
        submittedAt,
        failedVerificationTaxonomy: FailureTaxonomy.ImplementationDefect,
        runtime: { worktreeRoot: binding.worktreeRoot },
      },
    },
    input,
  );
}

/** 使用生产 Parser 复验 Completion 输入及 Pilot 固定绑定。 */
export function validateSessionCompletionInput(input, expected) {
  const parsed = parseCodingTaskDeliveryCompletionInput(input, digestPort);
  if (parsed.status === ResultStatus.Failure) {
    throw new Error("Session Completion 输入不符合生产领域契约。", { cause: parsed.error });
  }
  const completion = parsed.value;
  const binding = createCompletionBinding(expected);
  if (
    completion.deliveryCommand.aggregateId !== binding.codingTaskId ||
    completion.deliveryCommand.expectedVersion !== binding.expectedVersion ||
    completion.deliveryCommand.actor.actorId !== binding.agentActorId ||
    completion.deliveryCommand.correlationId !== binding.correlationId ||
    completion.deliveryCommand.causationId !== binding.closeoutCommandId ||
    completion.deliveryCommand.payload.workspaceId !== binding.workspaceId ||
    completion.deliveryCommand.payload.sessionId !== binding.sessionId ||
    completion.deliveryCommand.payload.expectedCheckpointBindingDigest !==
      binding.checkpointBindingDigest ||
    completion.deliveryCommand.payload.expectedEffectiveSource !== binding.effectiveSource ||
    completion.profileCompilation.taskId !== binding.taskId ||
    completion.profileCompilation.artifactId !== binding.profileArtifactId ||
    completion.verification.actor.actorId !== binding.agentActorId ||
    completion.verification.runtime.worktreeRoot !== binding.worktreeRoot ||
    !isDeepStrictEqual(completion.profileCompilation.report, expected.report) ||
    !isDeepStrictEqual(completion.ruleResolutionContext, binding.ruleResolutionContext)
  ) {
    throw new Error("Session Completion 输入未绑定当前 Pilot 状态。");
  }
  return globalThis.structuredClone(completion);
}

function createCompletionBinding(input) {
  const source = input.sourceState;
  const manifest = source.activation?.manifest;
  const bundle = source.profile?.bundle;
  const effective = input.effectiveCloseout;
  if (
    effective?.status !== CodingTaskSessionEffectiveCloseoutStatus.Resolved ||
    !Object.values(CodingTaskSessionEffectiveCloseoutSource).includes(effective.source)
  ) {
    throw new Error("Effective Closeout 未解析出权威 Checkpoint。");
  }
  const expectedVersion = resolveCodingTaskVersion(source.activation?.result?.receipts);
  const ruleCatalog = bundle?.ruleCatalog;
  const repositoryId = source.fixedProject?.repositoryId;
  const ruleTargets = source.fixedProject?.ruleTargets;
  if (!Array.isArray(ruleTargets) || ruleTargets.length === 0) {
    throw new Error("Pilot Case 缺少显式 Rule Target。");
  }
  return {
    workspaceId: source.task?.workspaceId,
    sessionId: manifest?.sessionId,
    codingTaskId: manifest?.createCommand?.aggregateId,
    taskId: source.task?.taskId,
    profileArtifactId: input.profileArtifactId,
    agentActorId: source.actor?.agentActorId,
    correlationId: manifest?.createCommand?.correlationId,
    closeoutCommandId: source.closeout?.command?.commandId,
    worktreeRoot: source.activation?.worktreeRoot,
    checkpointBindingDigest: effective.checkpoint?.bindingDigest,
    effectiveSource: effective.source,
    expectedVersion,
    ruleResolutionContext: {
      taskId: source.task?.taskId,
      workspaceRef: globalThis.structuredClone(ruleCatalog?.workspaceRef),
      repositoryRefs: globalThis.structuredClone(ruleCatalog?.repositoryRefs),
      targets: ruleTargets.map((target) => ({
        ...globalThis.structuredClone(target),
        repositoryId,
      })),
      availableValidatorIds: [
        ...new Set(source.fixedProject.verificationChecks.flatMap((check) => check.validatorIds)),
      ].sort(),
      availableCapabilityIds: [...source.fixedProject.availableCapabilityIds].sort(),
    },
  };
}

function resolveCodingTaskVersion(receipts) {
  if (!Array.isArray(receipts)) throw new Error("Activation 缺少生产 Command Receipt。");
  const versions = receipts
    .map((entry) => entry?.receipt?.committedVersion)
    .filter((value) => Number.isInteger(value) && value >= 1);
  if (versions.length === 0) throw new Error("Activation 缺少已提交的 CodingTask Version。");
  return Math.max(...versions);
}
