import {
  ResultStatus,
  failure,
  success,
  validateActorRef,
  type ActorRef,
  type HarnessError,
  type Result,
} from "#common/index.js";
import { parseCodingTaskId } from "#domain/codingTask/index.js";
import { parseCodingTaskSessionId } from "#domain/codingTaskSession/index.js";
import { parseTaskId } from "#domain/task/index.js";
import { parseRepositoryId, parseWorkspaceId } from "#domain/workspace/index.js";

import type { CodingTaskSessionCloseoutStateIdentity } from "../contracts/index.js";
import {
  hasExactKeys,
  invalid,
  isRecord,
  parseDigest,
  parseIsoUtc,
  parseSafeText,
  type UnknownRecord,
} from "./closeoutValidationSupport.js";

/** 严格解析 Closeout 不可变身份。 */
export function parseCloseoutIdentity(
  input: UnknownRecord,
): Result<CodingTaskSessionCloseoutStateIdentity, HarnessError> {
  const workspaceId = parseStringId(input["workspaceId"], parseWorkspaceId, "workspaceId");
  if (workspaceId.status === ResultStatus.Failure) return failure(invalid("workspaceId"));
  const sessionId = parseStringId(input["sessionId"], parseCodingTaskSessionId, "sessionId");
  if (sessionId.status === ResultStatus.Failure) return failure(invalid("sessionId"));
  const codingTaskId = parseStringId(input["codingTaskId"], parseCodingTaskId, "codingTaskId");
  if (codingTaskId.status === ResultStatus.Failure) return failure(invalid("codingTaskId"));
  const sourceTaskId = parseStringId(input["sourceTaskId"], parseTaskId, "sourceTaskId");
  if (sourceTaskId.status === ResultStatus.Failure) return failure(invalid("sourceTaskId"));
  const repositoryId = parseStringId(input["repositoryId"], parseRepositoryId, "repositoryId");
  if (repositoryId.status === ResultStatus.Failure) return failure(invalid("repositoryId"));
  const attemptNumber = parseAttemptNumber(input["attemptNumber"]);
  if (attemptNumber.status === ResultStatus.Failure) return attemptNumber;
  const activationBindingDigest = parseDigest(
    input["activationBindingDigest"],
    "activationBindingDigest",
  );
  if (activationBindingDigest.status === ResultStatus.Failure) return activationBindingDigest;
  const sessionBindingDigest = parseDigest(input["sessionBindingDigest"], "sessionBindingDigest");
  if (sessionBindingDigest.status === ResultStatus.Failure) return sessionBindingDigest;
  const requestDigest = parseDigest(input["requestDigest"], "requestDigest");
  if (requestDigest.status === ResultStatus.Failure) return requestDigest;
  const idempotencyKey = parseSafeText(input["idempotencyKey"], "idempotencyKey");
  if (idempotencyKey.status === ResultStatus.Failure) return idempotencyKey;
  const commandId = parseSafeText(input["commandId"], "commandId");
  if (commandId.status === ResultStatus.Failure) return commandId;
  const correlationId = parseSafeText(input["correlationId"], "correlationId");
  if (correlationId.status === ResultStatus.Failure) return correlationId;
  const causationId = parseOptionalText(input["causationId"], "causationId");
  if (causationId.status === ResultStatus.Failure) return causationId;
  const actor = parseActor(input["actor"]);
  if (actor.status === ResultStatus.Failure) return actor;
  const createdAt = parseIsoUtc(input["createdAt"], "createdAt");
  if (createdAt.status === ResultStatus.Failure) return createdAt;

  return success({
    workspaceId: workspaceId.value,
    sessionId: sessionId.value,
    codingTaskId: codingTaskId.value,
    sourceTaskId: sourceTaskId.value,
    repositoryId: repositoryId.value,
    attemptNumber: attemptNumber.value,
    activationBindingDigest: activationBindingDigest.value,
    sessionBindingDigest: sessionBindingDigest.value,
    requestDigest: requestDigest.value,
    idempotencyKey: idempotencyKey.value,
    commandId: commandId.value,
    correlationId: correlationId.value,
    ...(causationId.value === undefined ? {} : { causationId: causationId.value }),
    actor: actor.value,
    createdAt: createdAt.value,
  });
}

function parseStringId<T>(
  value: unknown,
  parser: (value: string) => Result<T, HarnessError>,
  field: string,
): Result<T, HarnessError> {
  if (typeof value !== "string") return failure(invalid(field));
  const parsed = parser(value);
  return parsed.status === ResultStatus.Failure ? failure(invalid(field)) : parsed;
}

function parseActor(value: unknown): Result<ActorRef, HarnessError> {
  if (!isRecord(value) || !hasExactKeys(value, ["kind", "actorId"])) {
    return failure(invalid("actor"));
  }
  const parsed = validateActorRef(value);
  if (
    parsed.status === ResultStatus.Failure ||
    parsed.value.kind !== value["kind"] ||
    parsed.value.actorId !== value["actorId"]
  ) {
    return failure(invalid("actor"));
  }
  return parsed;
}

function parseAttemptNumber(value: unknown): Result<number, HarnessError> {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? success(value)
    : failure(invalid("attemptNumber"));
}

function parseOptionalText(
  value: unknown,
  field: string,
): Result<string | undefined, HarnessError> {
  if (value === undefined) return success(undefined);
  const parsed = parseSafeText(value, field);
  return parsed.status === ResultStatus.Failure ? parsed : success(parsed.value);
}
