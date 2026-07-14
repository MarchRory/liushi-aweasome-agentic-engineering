import { describe, expect, it } from "vitest";

import {
  COMMAND_ENVELOPE_SCHEMA_VERSION,
  COMMAND_INVOCATION_PROVENANCE_SCHEMA_VERSION,
  CommandErrorCode,
  CommandStatus,
  createCommandEnvelope,
  createCommandReceipt,
  isCommandErrorCode,
  isCommandStatus,
  parseCommandEnvelope,
  parseCommandReceipt,
} from "../../src/application/index.js";
import { ActorKind, HarnessErrorCode, ResultStatus } from "../../src/common/index.js";

const requestDigest = `sha256:${"a".repeat(64)}`;

describe("Application Command contracts", () => {
  it("constructs a deterministic versioned Command Envelope with the full S0 field set", () => {
    const input = createEnvelopeInput();
    const first = createCommandEnvelope(input);
    const second = createCommandEnvelope(input);

    expect(first).toEqual(second);
    expect(first.status).toBe(ResultStatus.Success);
    if (first.status === ResultStatus.Success) {
      expect(first.value).toEqual({
        schemaVersion: COMMAND_ENVELOPE_SCHEMA_VERSION,
        commandId: "command-1",
        commandType: "task.create",
        aggregateType: "task",
        aggregateId: "task-1",
        expectedVersion: 0,
        idempotencyKey: "request-1",
        requestDigest,
        actor: { kind: "human", actorId: "operator-1" },
        authorizationContext: { roles: ["operator"] },
        correlationId: "correlation-1",
        causationId: "causation-1",
        submittedAt: "2026-07-12T00:00:00.000Z",
        payload: { workspaceId: "workspace-1" },
      });
    }
  });

  it("保留合法的 Command Invocation Provenance 并支持往返解析", () => {
    const created = createCommandEnvelope({
      ...createEnvelopeInput(),
      invocationProvenance: createInvocationProvenance(),
    });

    expect(created.status).toBe(ResultStatus.Success);
    if (created.status === ResultStatus.Success) {
      const roundTrip = parseCommandEnvelope(JSON.parse(JSON.stringify(created.value)) as unknown);
      expect(roundTrip).toEqual(created);
      expect(created.value.invocationProvenance).toEqual(createInvocationProvenance());
    }
  });

  it.each([
    ["空白 executor", { ...createInvocationProvenance(), executor: " " }],
    ["包含 NUL 的 toolName", { ...createInvocationProvenance(), toolName: "shell\0command" }],
    ["非法 sessionIdDigest", { ...createInvocationProvenance(), sessionIdDigest: "session-1" }],
    ["未知嵌套字段", { ...createInvocationProvenance(), unexpected: true }],
  ])("拒绝 %s", (_name, invocationProvenance) => {
    const result = parseCommandEnvelope({
      ...createEnvelopeInput(),
      schemaVersion: COMMAND_ENVELOPE_SCHEMA_VERSION,
      invocationProvenance,
    });

    expect(result.status).toBe(ResultStatus.Failure);
  });

  it("rejects unknown envelope fields and unsupported schema versions", () => {
    const withUnknownField = parseCommandEnvelope({
      ...createEnvelopeInput(),
      unexpected: true,
    });
    const withUnknownVersion = parseCommandEnvelope({
      ...createEnvelopeInput(),
      schemaVersion: "2.0.0",
    });

    expect(withUnknownField.status).toBe(ResultStatus.Failure);
    expect(withUnknownVersion.status).toBe(ResultStatus.Failure);
    if (withUnknownVersion.status === ResultStatus.Failure) {
      expect(withUnknownVersion.error.code).toBe(HarnessErrorCode.InvalidInput);
    }
  });

  it("rejects a non-serializable authorization context", () => {
    const result = parseCommandEnvelope({
      ...createEnvelopeInput(),
      schemaVersion: COMMAND_ENVELOPE_SCHEMA_VERSION,
      authorizationContext: { resolve: () => "operator" },
    });

    expect(result.status).toBe(ResultStatus.Failure);
  });

  it.each([
    ["negative expectedVersion", { expectedVersion: -1 }],
    ["invalid requestDigest", { requestDigest: "sha256:not-a-digest" }],
    ["invalid submittedAt", { submittedAt: "not-a-date" }],
    ["blank idempotencyKey", { idempotencyKey: " " }],
  ])("rejects %s", (_name, override) => {
    const result = createCommandEnvelope({ ...createEnvelopeInput(), ...override });
    expect(result.status).toBe(ResultStatus.Failure);
  });

  it.each([
    [CommandStatus.Committed, { committedVersion: 1 }],
    [CommandStatus.Rejected, { errorCode: CommandErrorCode.AuthorizationDenied }],
    [CommandStatus.Conflict, { errorCode: CommandErrorCode.VersionConflict }],
    [CommandStatus.Duplicate, { duplicateOfCommandId: "command-0" }],
    [CommandStatus.OutcomeUnknown, { errorCode: CommandErrorCode.OutcomeUnknown }],
  ])("accepts the %s receipt outcome", (status, details) => {
    const result = createCommandReceipt({
      commandId: "command-1",
      status,
      requestDigest,
      ...details,
    });

    expect(result.status).toBe(ResultStatus.Success);
  });

  it.each([
    [CommandStatus.Committed, { status: CommandStatus.Committed }],
    [CommandStatus.Duplicate, { status: CommandStatus.Duplicate }],
    [CommandStatus.Conflict, { status: CommandStatus.Conflict }],
  ])("rejects an incomplete %s receipt", (_name, input) => {
    const result = parseCommandReceipt({
      schemaVersion: "1.0.0",
      commandId: "command-1",
      requestDigest,
      ...input,
    });

    expect(result.status).toBe(ResultStatus.Failure);
  });

  it("rejects inconsistent receipt fields", () => {
    const result = parseCommandReceipt({
      schemaVersion: "1.0.0",
      commandId: "command-1",
      status: CommandStatus.Committed,
      requestDigest,
      committedVersion: 1,
      errorCode: CommandErrorCode.OutcomeUnknown,
    });

    expect(result.status).toBe(ResultStatus.Failure);
  });

  it("exposes enum-backed status and error guards", () => {
    expect(isCommandStatus(CommandStatus.Conflict)).toBe(true);
    expect(isCommandStatus("conflict")).toBe(true);
    expect(isCommandStatus("unknown")).toBe(false);
    expect(isCommandErrorCode(CommandErrorCode.IdempotencyConflict)).toBe(true);
    expect(isCommandErrorCode("idempotency_conflict")).toBe(true);
    expect(isCommandErrorCode("not-an-error")).toBe(false);
  });
});

function createEnvelopeInput() {
  return {
    commandId: "command-1",
    commandType: "task.create",
    aggregateType: "task",
    aggregateId: "task-1",
    expectedVersion: 0,
    idempotencyKey: "request-1",
    requestDigest,
    actor: { kind: ActorKind.Human, actorId: "operator-1" },
    authorizationContext: { roles: ["operator"] },
    correlationId: "correlation-1",
    causationId: "causation-1",
    submittedAt: "2026-07-12T00:00:00.000Z",
    payload: { workspaceId: "workspace-1" },
  };
}

function createInvocationProvenance() {
  return {
    schemaVersion: COMMAND_INVOCATION_PROVENANCE_SCHEMA_VERSION,
    executor: "codex",
    invocationId: `sha256:${"1".repeat(64)}`,
    sessionIdDigest: `sha256:${"2".repeat(64)}`,
    turnIdDigest: `sha256:${"3".repeat(64)}`,
    toolCallIdDigest: `sha256:${"4".repeat(64)}`,
    toolName: "shell_command",
    targetsDigest: `sha256:${"5".repeat(64)}`,
    inputDigest: `sha256:${"6".repeat(64)}`,
  };
}
