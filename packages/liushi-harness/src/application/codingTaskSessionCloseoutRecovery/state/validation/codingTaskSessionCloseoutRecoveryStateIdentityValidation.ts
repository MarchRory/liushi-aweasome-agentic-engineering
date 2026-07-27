import {
  ActorKind,
  ResultStatus,
  failure,
  success,
  validateActorRef,
  type ActorRef,
  type ContentDigest,
  type HarnessError,
  type Result,
} from "#common/index.js";
import { parseCodingTaskId } from "#domain/codingTask/index.js";
import { parseCodingTaskSessionId } from "#domain/codingTaskSession/index.js";
import { parseTaskId } from "#domain/task/index.js";
import { parseRepositoryId, parseWorkspaceId } from "#domain/workspace/index.js";

import type { CodingTaskSessionCloseoutRecoveryStateIdentity } from "../contracts/index.js";
import { CodingTaskSessionCloseoutRecoveryResolution } from "#application/codingTaskSessionCloseoutRecovery/enums/index.js";
import {
  invalid,
  isRecord,
  parseDigest,
  parseIsoUtc,
  parseNonNegativeInteger,
  parseSafeText,
  hasExactKeys,
  type UnknownRecord,
} from "./codingTaskSessionCloseoutRecoveryStateSupport.js";

/** 严格解析 Recovery State 的不可变身份。 */
export function parseRecoveryStateIdentity(
  input: UnknownRecord,
): Result<CodingTaskSessionCloseoutRecoveryStateIdentity, HarnessError> {
  const workspaceId = parseId(input["workspaceId"], parseWorkspaceId, "workspaceId");
  if (workspaceId.status === ResultStatus.Failure) return workspaceId;
  const sessionId = parseId(input["sessionId"], parseCodingTaskSessionId, "sessionId");
  if (sessionId.status === ResultStatus.Failure) return sessionId;
  const codingTaskId = parseId(input["codingTaskId"], parseCodingTaskId, "codingTaskId");
  if (codingTaskId.status === ResultStatus.Failure) return codingTaskId;
  const sourceTaskId = parseId(input["sourceTaskId"], parseTaskId, "sourceTaskId");
  if (sourceTaskId.status === ResultStatus.Failure) return sourceTaskId;
  const repositoryId = parseId(input["repositoryId"], parseRepositoryId, "repositoryId");
  if (repositoryId.status === ResultStatus.Failure) return repositoryId;

  const attemptNumber = parsePositiveInteger(input["attemptNumber"], "attemptNumber");
  if (attemptNumber.status === ResultStatus.Failure) return attemptNumber;
  const closeoutStateDigest = parseDigest(input["closeoutStateDigest"], "closeoutStateDigest");
  if (closeoutStateDigest.status === ResultStatus.Failure) return closeoutStateDigest;
  const closeoutVersion = parseNonNegativeInteger(input["closeoutVersion"], "closeoutVersion");
  if (closeoutVersion.status === ResultStatus.Failure) return closeoutVersion;
  const assessmentDigest = parseDigest(input["assessmentDigest"], "assessmentDigest");
  if (assessmentDigest.status === ResultStatus.Failure) return assessmentDigest;
  const preSubmitSnapshotDigest = parseDigest(
    input["preSubmitSnapshotDigest"],
    "preSubmitSnapshotDigest",
  );
  if (preSubmitSnapshotDigest.status === ResultStatus.Failure) return preSubmitSnapshotDigest;
  const changeSetDigest = parseDigest(input["changeSetDigest"], "changeSetDigest");
  if (changeSetDigest.status === ResultStatus.Failure) return changeSetDigest;
  const assessmentCheckpointBindingDigest = parseNullableDigest(
    input["assessmentCheckpointBindingDigest"],
    "assessmentCheckpointBindingDigest",
  );
  if (assessmentCheckpointBindingDigest.status === ResultStatus.Failure) {
    return assessmentCheckpointBindingDigest;
  }
  const requestDigest = parseDigest(input["requestDigest"], "requestDigest");
  if (requestDigest.status === ResultStatus.Failure) return requestDigest;
  const requestedResolution = parseResolution(input["requestedResolution"]);
  if (requestedResolution.status === ResultStatus.Failure) return requestedResolution;
  if (
    !hasValidAssessmentCheckpointBinding(
      requestedResolution.value,
      assessmentCheckpointBindingDigest.value,
    )
  ) {
    return failure(invalid("assessmentCheckpointBindingDigest"));
  }
  const actor = parseHumanActor(input["actor"]);
  if (actor.status === ResultStatus.Failure) return actor;
  const commandId = parseSafeText(input["commandId"], "commandId");
  if (commandId.status === ResultStatus.Failure) return commandId;
  const idempotencyKey = parseSafeText(input["idempotencyKey"], "idempotencyKey");
  if (idempotencyKey.status === ResultStatus.Failure) return idempotencyKey;
  const correlationId = parseSafeText(input["correlationId"], "correlationId");
  if (correlationId.status === ResultStatus.Failure) return correlationId;
  const causationId = parseOptionalText(input["causationId"], "causationId");
  if (causationId.status === ResultStatus.Failure) return causationId;
  const createdAt = parseIsoUtc(input["createdAt"], "createdAt");
  if (createdAt.status === ResultStatus.Failure) return createdAt;

  return success({
    workspaceId: workspaceId.value,
    sessionId: sessionId.value,
    codingTaskId: codingTaskId.value,
    sourceTaskId: sourceTaskId.value,
    repositoryId: repositoryId.value,
    attemptNumber: attemptNumber.value,
    closeoutStateDigest: closeoutStateDigest.value,
    closeoutVersion: closeoutVersion.value,
    assessmentDigest: assessmentDigest.value,
    preSubmitSnapshotDigest: preSubmitSnapshotDigest.value,
    changeSetDigest: changeSetDigest.value,
    assessmentCheckpointBindingDigest: assessmentCheckpointBindingDigest.value,
    requestDigest: requestDigest.value,
    requestedResolution: requestedResolution.value,
    actor: actor.value,
    commandId: commandId.value,
    idempotencyKey: idempotencyKey.value,
    correlationId: correlationId.value,
    ...(causationId.value === undefined ? {} : { causationId: causationId.value }),
    createdAt: createdAt.value,
  });
}

function parseId<T>(
  value: unknown,
  parser: (value: string) => Result<T, HarnessError>,
  field: string,
): Result<T, HarnessError> {
  if (typeof value !== "string") return failure(invalid(field));
  const parsed = parser(value);
  return parsed.status === ResultStatus.Failure ? failure(invalid(field)) : parsed;
}

function parsePositiveInteger(value: unknown, field: string): Result<number, HarnessError> {
  const parsed = parseNonNegativeInteger(value, field);
  return parsed.status === ResultStatus.Success && parsed.value > 0
    ? parsed
    : failure(invalid(field));
}

function parseResolution(
  value: unknown,
): Result<CodingTaskSessionCloseoutRecoveryResolution, HarnessError> {
  return typeof value === "string" &&
    Object.values(CodingTaskSessionCloseoutRecoveryResolution).includes(
      value as CodingTaskSessionCloseoutRecoveryResolution,
    )
    ? success(value as CodingTaskSessionCloseoutRecoveryResolution)
    : failure(invalid("requestedResolution"));
}

function parseNullableDigest(
  value: unknown,
  field: string,
): Result<ContentDigest | null, HarnessError> {
  return value === null ? success(null) : parseDigest(value, field);
}

function hasValidAssessmentCheckpointBinding(
  resolution: CodingTaskSessionCloseoutRecoveryResolution,
  bindingDigest: CodingTaskSessionCloseoutRecoveryStateIdentity["assessmentCheckpointBindingDigest"],
): boolean {
  return resolution === CodingTaskSessionCloseoutRecoveryResolution.BindExisting
    ? bindingDigest !== null
    : bindingDigest === null;
}

function parseHumanActor(value: unknown): Result<ActorRef, HarnessError> {
  if (!isRecord(value) || !hasExactKeys(value, ["kind", "actorId"])) {
    return failure(invalid("actor"));
  }
  const parsed = validateActorRef(value);
  return parsed.status === ResultStatus.Success &&
    parsed.value.kind === ActorKind.Human &&
    parsed.value.kind === value["kind"] &&
    parsed.value.actorId === value["actorId"]
    ? success(parsed.value)
    : failure(invalid("actor"));
}

function parseOptionalText(
  value: unknown,
  field: string,
): Result<string | undefined, HarnessError> {
  if (value === undefined) return success(undefined);
  const parsed = parseSafeText(value, field);
  return parsed.status === ResultStatus.Failure ? parsed : success(parsed.value);
}
