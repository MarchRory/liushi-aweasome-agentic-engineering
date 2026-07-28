import { AGENT_ACTOR_ID, COMMAND_TYPES } from "../../constants/index.mjs";
import { calculateDigest } from "../../digest/index.mjs";
import { createSessionActivationPayloads } from "../manifest/index.mjs";

const ACTIVATION_SCHEMA_VERSION = "coding-task.session.activation.v1";
const COMMAND_SCHEMA_VERSION = "1.0.0";
const AGGREGATE_TYPE = "coding_task";
const IDENTIFIER_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/u;

export function validateSessionActivationManifest(manifest, input) {
  requireRecord(manifest, "Session Activation Manifest");
  const createCommand = requireRecord(manifest.createCommand, "Create Command");
  const provision = requireRecord(manifest.provision, "Provision");
  const provisionCommand = requireRecord(provision.command, "Provision Command");
  const startAttemptCommand = requireRecord(manifest.startAttemptCommand, "Start Attempt Command");
  const codingTaskId = requireIdentifier(createCommand.aggregateId, "Coding Task ID");
  const actionId = requireIdentifier(provisionCommand.payload?.actionId, "Provision Action ID");
  const correlationId = requireIdentifier(createCommand.correlationId, "Correlation ID");
  const payloads = createSessionActivationPayloads({
    ...input,
    codingTaskId,
    actionId,
  });
  const expected = {
    schemaVersion: ACTIVATION_SCHEMA_VERSION,
    sessionId: requireIdentifier(manifest.sessionId, "Session ID"),
    createCommand: createExpectedCommand({
      actual: createCommand,
      commandType: COMMAND_TYPES.Create,
      aggregateId: codingTaskId,
      expectedVersion: 0,
      correlationId,
      payload: payloads.createPayload,
    }),
    provision: {
      command: createExpectedCommand({
        actual: provisionCommand,
        commandType: COMMAND_TYPES.Provision,
        aggregateId: codingTaskId,
        expectedVersion: 1,
        correlationId,
        payload: payloads.provisionPayload,
      }),
      runtime: { repositoryRoot: input.repositoryRoot },
    },
    startAttemptCommand: createExpectedCommand({
      actual: startAttemptCommand,
      commandType: COMMAND_TYPES.StartAttempt,
      aggregateId: codingTaskId,
      expectedVersion: 1,
      correlationId,
      payload: payloads.startPayload,
    }),
  };
  if (calculateDigest(manifest) !== calculateDigest(expected)) {
    throw new Error("Session Activation Manifest 未精确绑定当前任务、仓库或执行授权。");
  }
  return manifest;
}

function createExpectedCommand(input) {
  const commandId = requireIdentifier(input.actual.commandId, "Command ID");
  const submittedAt = requireIsoTimestamp(input.actual.submittedAt);
  return {
    schemaVersion: COMMAND_SCHEMA_VERSION,
    commandId,
    commandType: input.commandType,
    aggregateType: AGGREGATE_TYPE,
    aggregateId: input.aggregateId,
    expectedVersion: input.expectedVersion,
    idempotencyKey: commandId,
    requestDigest: calculateDigest(input.payload),
    actor: { kind: "agent", actorId: AGENT_ACTOR_ID },
    authorizationContext: {},
    correlationId: input.correlationId,
    submittedAt,
    payload: input.payload,
  };
}

function requireIdentifier(value, label) {
  if (typeof value !== "string" || !IDENTIFIER_PATTERN.test(value)) {
    throw new Error(`${label} 缺失或无效。`);
  }
  return value;
}

function requireIsoTimestamp(value) {
  if (
    typeof value !== "string" ||
    Number.isNaN(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    throw new Error("Command submittedAt 缺失或无效。");
  }
  return value;
}

function requireRecord(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} 缺失或无效。`);
  }
  return value;
}
