import { describe, expect, it } from "vitest";

import {
  ACTION_JOURNAL_SCHEMA_VERSION,
  ActionJournalStatus,
  ActionJournalRecordType,
  ActionKind,
  ActionOutcome,
  ActionResolution,
  ActorKind,
  HarnessErrorCode,
  ResultStatus,
  appendActionObservation,
  appendActionResolution,
  createActionJournalState,
  parseActionIntent,
  parseActionJournalRecord,
  parseActionObservation,
  parseActionResolution,
  type ActionIntentRecord,
  type ActionObservationRecord,
  type ActionResolutionRecord,
} from "../../src/index.js";

const digest = `sha256:${"a".repeat(64)}`;
const actionId = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const actor = { kind: ActorKind.System, actorId: "action-journal-test" };

describe("Action Journal", () => {
  it("严格解析执行前 Intent 和结构化 Observation", () => {
    const intent = parseActionIntent(intentInput());
    const observation = parseActionObservation(observationInput(2, ActionOutcome.Succeeded));

    expect(intent.status).toBe(ResultStatus.Success);
    expect(observation.status).toBe(ResultStatus.Success);
    expect(parseActionJournalRecord(intentInput()).status).toBe(ResultStatus.Success);
  });

  it("拒绝重复 Evidence 和没有错误码的未知结果", () => {
    const duplicateEvidence = parseActionObservation({
      ...observationInput(2, ActionOutcome.Succeeded),
      evidenceIds: ["evidence-a", "evidence-a"],
    });
    const unknownWithoutCode = parseActionObservation({
      ...observationInput(2, ActionOutcome.OutcomeUnknown),
      errorCode: undefined,
    });

    expect(duplicateEvidence.status).toBe(ResultStatus.Failure);
    expect(unknownWithoutCode.status).toBe(ResultStatus.Failure);
  });

  it("Succeeded 只能进入 Committed 或 Recovered，终态禁止继续执行", () => {
    const observed = appendActionObservation(
      createActionJournalState(intent()),
      observation(2, ActionOutcome.Succeeded),
    );
    expect(observed.status).toBe(ResultStatus.Success);
    if (observed.status !== ResultStatus.Success) {
      throw observed.error;
    }
    const committed = appendActionResolution(
      observed.value,
      resolution(3, ActionResolution.Committed),
    );
    expect(committed.status).toBe(ResultStatus.Success);
    if (committed.status !== ResultStatus.Success) {
      throw committed.error;
    }
    expect(committed.value.status).toBe(ActionJournalStatus.Committed);

    const afterTerminal = appendActionObservation(
      committed.value,
      observation(4, ActionOutcome.NotApplied),
    );
    expect(afterTerminal.status).toBe(ResultStatus.Failure);
    if (afterTerminal.status === ResultStatus.Failure) {
      expect(afterTerminal.error.code).toBe(HarnessErrorCode.InvalidStateTransition);
    }
  });

  it("OutcomeUnknown 禁止自动重试，Human 处理后可记录恢复证据", () => {
    const observedUnknown = appendActionObservation(
      createActionJournalState(intent()),
      observation(2, ActionOutcome.OutcomeUnknown),
    );
    expect(observedUnknown.status).toBe(ResultStatus.Success);
    if (observedUnknown.status !== ResultStatus.Success) {
      throw observedUnknown.error;
    }
    const invalidRetry = appendActionResolution(
      observedUnknown.value,
      resolution(3, ActionResolution.RetryPermitted),
    );
    expect(invalidRetry.status).toBe(ResultStatus.Failure);

    const waitingHuman = appendActionResolution(
      observedUnknown.value,
      resolution(3, ActionResolution.HumanRequired),
    );
    expect(waitingHuman.status).toBe(ResultStatus.Success);
    if (waitingHuman.status !== ResultStatus.Success) {
      throw waitingHuman.error;
    }
    expect(waitingHuman.value.status).toBe(ActionJournalStatus.WaitingHuman);

    const recoveredObservation = appendActionObservation(
      waitingHuman.value,
      observation(4, ActionOutcome.Succeeded),
    );
    expect(recoveredObservation.status).toBe(ResultStatus.Success);
    if (recoveredObservation.status !== ResultStatus.Success) {
      throw recoveredObservation.error;
    }
    const recovered = appendActionResolution(
      recoveredObservation.value,
      resolution(5, ActionResolution.Recovered),
    );
    expect(recovered.status).toBe(ResultStatus.Success);
    if (recovered.status === ResultStatus.Success) {
      expect(recovered.value.status).toBe(ActionJournalStatus.Recovered);
    }
  });

  it("只有明确 NotApplied 才允许同幂等键重试", () => {
    const notApplied = appendActionObservation(
      createActionJournalState(intent()),
      observation(2, ActionOutcome.NotApplied),
    );
    expect(notApplied.status).toBe(ResultStatus.Success);
    if (notApplied.status !== ResultStatus.Success) {
      throw notApplied.error;
    }
    const retry = appendActionResolution(
      notApplied.value,
      resolution(3, ActionResolution.RetryPermitted),
    );

    expect(retry.status).toBe(ResultStatus.Success);
    if (retry.status === ResultStatus.Success) {
      expect(retry.value.status).toBe(ActionJournalStatus.RetryPermitted);
      expect(
        appendActionObservation(retry.value, observation(4, ActionOutcome.Succeeded)).status,
      ).toBe(ResultStatus.Success);
    }
  });
});

function intentInput(): Record<string, unknown> {
  return {
    schemaVersion: ACTION_JOURNAL_SCHEMA_VERSION,
    recordType: ActionJournalRecordType.Intent,
    actionId,
    sequence: 1,
    workspaceId: "workspace-a",
    taskId: "01ARZ3NDEKTSV4RRFFQ69G5FAW",
    commandId: "command-a",
    correlationId: "correlation-a",
    idempotencyKey: "action-a",
    kind: ActionKind.FileMutation,
    target: "packages/liushi-harness/src/index.ts",
    inputDigest: digest,
    postconditionDigest: digest,
    recoveryGuidance: "检查目标文件摘要并由 Human 决定恢复方式。",
    actor,
    recordedAt: "2026-07-12T00:00:00.000Z",
  };
}

function observationInput(sequence: number, outcome: ActionOutcome): Record<string, unknown> {
  return {
    schemaVersion: ACTION_JOURNAL_SCHEMA_VERSION,
    recordType: ActionJournalRecordType.Observation,
    actionId,
    workspaceId: "workspace-a",
    taskId: "01ARZ3NDEKTSV4RRFFQ69G5FAW",
    sequence,
    outcome,
    evidenceIds: ["evidence-a"],
    ...([ActionOutcome.Failed, ActionOutcome.OutcomeUnknown].includes(outcome)
      ? { errorCode: "action_result_uncertain" }
      : {}),
    actor,
    recordedAt: "2026-07-12T00:01:00.000Z",
  };
}

function resolutionInput(sequence: number, value: ActionResolution): Record<string, unknown> {
  return {
    schemaVersion: ACTION_JOURNAL_SCHEMA_VERSION,
    recordType: ActionJournalRecordType.Resolution,
    actionId,
    workspaceId: "workspace-a",
    taskId: "01ARZ3NDEKTSV4RRFFQ69G5FAW",
    sequence,
    resolution: value,
    reason: "由确定性 Outcome 选择对应处置。",
    actor,
    recordedAt: "2026-07-12T00:02:00.000Z",
  };
}

function intent(): ActionIntentRecord {
  const result = parseActionIntent(intentInput());
  if (result.status !== ResultStatus.Success) {
    throw result.error;
  }
  return result.value;
}

function observation(sequence: number, outcome: ActionOutcome): ActionObservationRecord {
  const result = parseActionObservation(observationInput(sequence, outcome));
  if (result.status !== ResultStatus.Success) {
    throw result.error;
  }
  return result.value;
}

function resolution(sequence: number, value: ActionResolution): ActionResolutionRecord {
  const result = parseActionResolution(resolutionInput(sequence, value));
  if (result.status !== ResultStatus.Success) {
    throw result.error;
  }
  return result.value;
}
