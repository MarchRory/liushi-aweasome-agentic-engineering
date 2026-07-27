import { describe, expect, it } from "vitest";

import {
  CODING_TASK_SESSION_CLOSEOUT_AGGREGATE_TYPE,
  CODING_TASK_SESSION_CLOSEOUT_RECOVERY_COMMAND_TYPE,
  COMMAND_ENVELOPE_SCHEMA_VERSION,
  CodingTaskSessionCloseoutRecoveryResolution,
  parseCodingTaskSessionCloseoutRecoveryCommand,
  type CommandEnvelopeInput,
} from "../../src/application/index.js";
import { ActorKind, HarnessErrorCode, ResultStatus } from "../../src/common/index.js";
import {
  digest,
  digestOf,
} from "../support/codingTaskSessionCloseout/codingTaskSessionCloseoutStateFixture.js";

const workspaceId = "closeout-recovery-test";
const sessionId = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const expectedAssessmentDigest = digestOf({ assessment: "closeout-recovery" });

describe("CodingTask Session Closeout Recovery Command", () => {
  it("解析正向命令并保留 Envelope 的 expectedVersion", () => {
    const command = createCommand({ expectedVersion: 17 });
    const result = parseCodingTaskSessionCloseoutRecoveryCommand(command, digest);

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status !== ResultStatus.Success) return;
    expect(result.value.expectedVersion).toBe(17);
    expect(result.value.payload).toEqual(validPayload());
    expect(result.value.requestDigest).toBe(digestOf(validPayload()));
  });

  it.each([
    ["额外字段", { unexpected: true }],
    ["错误 resolution", { requestedResolution: "unknown_resolution" }],
  ])("拒绝 Payload 的%s", (_name, payloadOverride) => {
    const payload = { ...validPayload(), ...payloadOverride };
    const result = parseCodingTaskSessionCloseoutRecoveryCommand(
      createCommand({ payload }),
      digest,
    );

    expectFailure(result, HarnessErrorCode.InvalidInput);
  });

  it.each([
    ["Workspace ID", { workspaceId: "../escape" }],
    ["Session ID", { sessionId: "not-a-session-ulid" }],
    ["Assessment Digest", { expectedAssessmentDigest: "not-a-digest" }],
  ])("拒绝非法%s", (_name, payloadOverride) => {
    const payload = { ...validPayload(), ...payloadOverride };
    const result = parseCodingTaskSessionCloseoutRecoveryCommand(
      createCommand({ payload }),
      digest,
    );

    expectFailure(result, HarnessErrorCode.InvalidInput);
  });

  it.each([
    ["错误 command type", { commandType: "coding_task_session.closeout.recover.v0" }],
    ["错误 aggregate type", { aggregateType: "coding_task" }],
  ])("拒绝%s", (_name, override) => {
    const result = parseCodingTaskSessionCloseoutRecoveryCommand(createCommand(override), digest);

    expectFailure(result, HarnessErrorCode.InvalidInput);
  });

  it("拒绝非 Human Actor 并返回 OperationForbidden", () => {
    const result = parseCodingTaskSessionCloseoutRecoveryCommand(
      createCommand({ actor: { kind: ActorKind.Agent, actorId: "recovery-agent" } }),
      digest,
    );

    expectFailure(result, HarnessErrorCode.OperationForbidden);
  });

  it.each(["2026-07-26T00:00:00.000+00:00", "2026-02-30T00:00:00.000Z"])(
    "拒绝非规范或非法 UTC submittedAt：%s",
    (submittedAt) => {
      const result = parseCodingTaskSessionCloseoutRecoveryCommand(
        createCommand({ submittedAt }),
        digest,
      );

      expectFailure(result, HarnessErrorCode.InvalidInput);
    },
  );

  it("接受无毫秒的规范 UTC submittedAt", () => {
    const result = parseCodingTaskSessionCloseoutRecoveryCommand(
      createCommand({ submittedAt: "2026-07-26T00:00:00Z" }),
      digest,
    );

    expect(result.status).toBe(ResultStatus.Success);
  });

  it("拒绝 aggregateId 漂移", () => {
    const result = parseCodingTaskSessionCloseoutRecoveryCommand(
      createCommand({ aggregateId: "01ARZ3NDEKTSV4RRFFQ69G5FAZ" }),
      digest,
    );

    expectFailure(result, HarnessErrorCode.InvalidInput);
  });

  it("拒绝 requestDigest 漂移", () => {
    const result = parseCodingTaskSessionCloseoutRecoveryCommand(
      createCommand({ requestDigest: digestOf({ drifted: true }) }),
      digest,
    );

    expectFailure(result, HarnessErrorCode.InvalidInput);
  });

  it("只使用规范四字段 Payload 重算 requestDigest", () => {
    const calculatedInputs: unknown[] = [];
    const result = parseCodingTaskSessionCloseoutRecoveryCommand(createCommand(), {
      calculate: (input) => {
        calculatedInputs.push(input);
        return digest.calculate(input);
      },
    });

    expect(result.status).toBe(ResultStatus.Success);
    expect(calculatedInputs).toEqual([validPayload()]);
  });
});

function validPayload() {
  return {
    workspaceId,
    sessionId,
    expectedAssessmentDigest,
    requestedResolution: CodingTaskSessionCloseoutRecoveryResolution.RetryOnce,
  } as const;
}

function createCommand(
  overrides: Partial<CommandEnvelopeInput<unknown>> = {},
): CommandEnvelopeInput<unknown> {
  const payload = overrides.payload ?? validPayload();
  return {
    schemaVersion: COMMAND_ENVELOPE_SCHEMA_VERSION,
    commandId: "closeout-recovery-command",
    commandType: CODING_TASK_SESSION_CLOSEOUT_RECOVERY_COMMAND_TYPE,
    aggregateType: CODING_TASK_SESSION_CLOSEOUT_AGGREGATE_TYPE,
    aggregateId: sessionId,
    expectedVersion: 0,
    idempotencyKey: "closeout-recovery-idempotency",
    requestDigest: digestOf(payload),
    actor: { kind: ActorKind.Human, actorId: "recovery-reviewer" },
    authorizationContext: {},
    correlationId: "closeout-recovery-correlation",
    submittedAt: "2026-07-26T00:00:00.000Z",
    ...overrides,
    payload,
  };
}

function expectFailure(
  result: ReturnType<typeof parseCodingTaskSessionCloseoutRecoveryCommand>,
  code: HarnessErrorCode,
): void {
  expect(result.status).toBe(ResultStatus.Failure);
  if (result.status === ResultStatus.Failure) expect(result.error.code).toBe(code);
}
