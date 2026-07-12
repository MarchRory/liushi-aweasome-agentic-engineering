import { describe, expect, it } from "vitest";

import {
  COMMAND_ENVELOPE_SCHEMA_VERSION,
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
