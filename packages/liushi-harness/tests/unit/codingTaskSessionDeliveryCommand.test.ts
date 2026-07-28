import { describe, expect, it } from "vitest";

import {
  CODING_TASK_AGGREGATE_TYPE,
  CODING_TASK_SESSION_DELIVERY_SUBMISSION_COMMAND_TYPE,
  COMMAND_ENVELOPE_SCHEMA_VERSION,
  CodingTaskSessionEffectiveCloseoutSource,
  parseCodingTaskSessionDeliverySubmissionCommand,
  type CommandEnvelopeInput,
} from "../../src/application/index.js";
import { ActorKind, HarnessErrorCode, ResultStatus } from "../../src/common/index.js";
import {
  digest,
  digestOf,
} from "../support/codingTaskSessionCloseout/codingTaskSessionCloseoutStateFixture.js";

const workspaceId = "delivery-command-workspace";
const sessionId = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const codingTaskId = "delivery-command-task";
const checkpointBindingDigest = digestOf({ checkpoint: "delivery" });

describe("CodingTask Session Delivery Command", () => {
  it("解析 Agent 命令并保留 CodingTask expectedVersion", () => {
    const result = parseCodingTaskSessionDeliverySubmissionCommand(
      createCommand({ expectedVersion: 7 }),
      digest,
    );

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status !== ResultStatus.Success) return;
    expect(result.value.expectedVersion).toBe(7);
    expect(result.value.aggregateId).toBe(codingTaskId);
    expect(result.value.payload).toEqual(validPayload());
  });

  it.each([
    ["额外字段", { unexpected: true }],
    ["错误来源", { expectedEffectiveSource: "unknown" }],
  ])("拒绝 Payload 的%s", (_name, payloadOverride) => {
    const payload = { ...validPayload(), ...payloadOverride };
    const result = parseCodingTaskSessionDeliverySubmissionCommand(
      createCommand({ payload }),
      digest,
    );

    expectFailure(result, HarnessErrorCode.InvalidInput);
  });

  it.each([
    ["Workspace ID", { workspaceId: "../escape" }],
    ["Session ID", { sessionId: "not-a-session" }],
    ["Checkpoint Digest", { expectedCheckpointBindingDigest: "not-a-digest" }],
  ])("拒绝非法%s", (_name, payloadOverride) => {
    const payload = { ...validPayload(), ...payloadOverride };
    const result = parseCodingTaskSessionDeliverySubmissionCommand(
      createCommand({ payload }),
      digest,
    );

    expectFailure(result, HarnessErrorCode.InvalidInput);
  });

  it.each([
    ["错误 command type", { commandType: "coding_task_session.delivery.submit.v0" }],
    ["错误 aggregate type", { aggregateType: "coding_task_session" }],
    ["非正 expectedVersion", { expectedVersion: 0 }],
  ])("拒绝%s", (_name, override) => {
    const result = parseCodingTaskSessionDeliverySubmissionCommand(createCommand(override), digest);

    expectFailure(result, HarnessErrorCode.InvalidInput);
  });

  it("拒绝非 Agent Actor", () => {
    const result = parseCodingTaskSessionDeliverySubmissionCommand(
      createCommand({ actor: { kind: ActorKind.Human, actorId: "delivery-reviewer" } }),
      digest,
    );

    expectFailure(result, HarnessErrorCode.OperationForbidden);
  });

  it.each(["2026-07-27T00:00:00.000+00:00", "2026-02-30T00:00:00.000Z"])(
    "拒绝非规范或非法 UTC submittedAt：%s",
    (submittedAt) => {
      const result = parseCodingTaskSessionDeliverySubmissionCommand(
        createCommand({ submittedAt }),
        digest,
      );

      expectFailure(result, HarnessErrorCode.InvalidInput);
    },
  );

  it("拒绝 requestDigest 漂移", () => {
    const result = parseCodingTaskSessionDeliverySubmissionCommand(
      createCommand({ requestDigest: digestOf({ drifted: true }) }),
      digest,
    );

    expectFailure(result, HarnessErrorCode.InvalidInput);
  });

  it("只使用规范四字段 Payload 重算 requestDigest", () => {
    const calculatedInputs: unknown[] = [];
    const result = parseCodingTaskSessionDeliverySubmissionCommand(createCommand(), {
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
    expectedCheckpointBindingDigest: checkpointBindingDigest,
    expectedEffectiveSource: CodingTaskSessionEffectiveCloseoutSource.Original,
  } as const;
}

function createCommand(
  overrides: Partial<CommandEnvelopeInput<unknown>> = {},
): CommandEnvelopeInput<unknown> {
  const payload = overrides.payload ?? validPayload();
  return {
    schemaVersion: COMMAND_ENVELOPE_SCHEMA_VERSION,
    commandId: "delivery-submission-command",
    commandType: CODING_TASK_SESSION_DELIVERY_SUBMISSION_COMMAND_TYPE,
    aggregateType: CODING_TASK_AGGREGATE_TYPE,
    aggregateId: codingTaskId,
    expectedVersion: 2,
    idempotencyKey: "delivery-submission-command",
    requestDigest: digestOf(payload),
    actor: { kind: ActorKind.Agent, actorId: "delivery-agent" },
    authorizationContext: {},
    correlationId: "delivery-correlation",
    causationId: "closeout-command",
    submittedAt: "2026-07-27T00:00:00.000Z",
    ...overrides,
    payload,
  };
}

function expectFailure(
  result: ReturnType<typeof parseCodingTaskSessionDeliverySubmissionCommand>,
  code: HarnessErrorCode,
): void {
  expect(result.status).toBe(ResultStatus.Failure);
  if (result.status === ResultStatus.Failure) expect(result.error.code).toBe(code);
}
