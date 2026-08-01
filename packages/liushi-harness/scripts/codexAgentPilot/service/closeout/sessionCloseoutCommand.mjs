import { isDeepStrictEqual } from "node:util";

import {
  ActorKind,
  CODING_TASK_SESSION_CLOSEOUT_AGGREGATE_TYPE,
  CODING_TASK_SESSION_CLOSEOUT_COMMAND_TYPE,
  COMMAND_ENVELOPE_SCHEMA_VERSION,
  ResultStatus,
  parseCodingTaskSessionCloseoutCommand,
  success,
} from "../../../../dist/index.js";
import { ulid } from "ulid";

import { calculateDigest } from "../../digest/index.mjs";

/** 创建绑定当前 Session 的生产 Closeout Command。 */
export function createSessionCloseoutCommand(input) {
  const commandId = ulid();
  const payload = {
    workspaceId: input.workspaceId,
    sessionId: input.sessionId,
  };
  return validateSessionCloseoutCommand(
    {
      schemaVersion: COMMAND_ENVELOPE_SCHEMA_VERSION,
      commandId,
      commandType: CODING_TASK_SESSION_CLOSEOUT_COMMAND_TYPE,
      aggregateType: CODING_TASK_SESSION_CLOSEOUT_AGGREGATE_TYPE,
      aggregateId: input.sessionId,
      expectedVersion: 0,
      idempotencyKey: commandId,
      requestDigest: calculateDigest(payload),
      actor: { kind: ActorKind.Agent, actorId: input.agentActorId },
      authorizationContext: {},
      correlationId: input.correlationId,
      submittedAt: input.submittedAt,
      payload,
    },
    input,
  );
}

/** 使用生产领域 Parser 并复验 Pilot Session 身份。 */
export function validateSessionCloseoutCommand(input, expected) {
  const parsed = parseCodingTaskSessionCloseoutCommand(input, {
    calculate: (value) => success(calculateDigest(value)),
  });
  if (parsed.status === ResultStatus.Failure) {
    throw new Error("Session Closeout Command 不符合生产领域契约。", {
      cause: parsed.error,
    });
  }
  const command = parsed.value;
  if (
    command.actor.actorId !== expected.agentActorId ||
    command.correlationId !== expected.correlationId ||
    command.aggregateId !== expected.sessionId ||
    !isDeepStrictEqual(command.payload, {
      workspaceId: expected.workspaceId,
      sessionId: expected.sessionId,
    })
  ) {
    throw new Error("Session Closeout Command 未绑定当前 Pilot Session。");
  }
  return globalThis.structuredClone(command);
}
