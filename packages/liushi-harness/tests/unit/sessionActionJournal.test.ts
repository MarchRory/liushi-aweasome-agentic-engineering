import { describe, expect, it } from "vitest";

import {
  ACTION_JOURNAL_SCHEMA_VERSION,
  SESSION_ACTION_JOURNAL_SCHEMA_VERSION,
  ActionJournalRecordType,
  ActionKind,
  ActionOutcome,
  ActionResolution,
  ActorKind,
  ResultStatus,
  SessionActionTraceDisposition,
  SessionActionTraceDropReason,
  appendActionObservation,
  appendActionResolution,
  createActionJournalState,
  parseActionIntent,
  parseActionJournalRecord,
  parseActionObservation,
  parseActionResolution,
  type ActionIntentRecord,
  type ActionResolutionRecord,
} from "../../src/index.js";

const digest = `sha256:${"b".repeat(64)}`;
const actionId = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const actor = { kind: ActorKind.System, actorId: "session-action-journal-test" };

describe("Session Action Journal 2.0.0", () => {
  it("解析 v2 Intent/Observation 并复用 v1 Resolution 状态机", () => {
    const intent = parseActionIntent(sessionIntentInput());
    const observation = parseActionObservation(sessionObservationInput());

    expect(intent.status).toBe(ResultStatus.Success);
    expect(observation.status).toBe(ResultStatus.Success);
    if (intent.status !== ResultStatus.Success || observation.status !== ResultStatus.Success) {
      throw new Error("v2 fixture should parse");
    }

    const observed = appendActionObservation(
      createActionJournalState(intent.value),
      observation.value,
    );
    expect(observed.status).toBe(ResultStatus.Success);
    if (observed.status !== ResultStatus.Success) throw observed.error;

    const resolved = appendActionResolution(
      observed.value,
      resolutionInput(ActionResolution.Committed),
    );
    expect(resolved.status).toBe(ResultStatus.Success);
  });

  it("允许同一 Task history 中按 Action 混合 v1 与 v2", () => {
    const legacy = parseActionJournalRecord(legacyIntentInput());
    const session = parseActionJournalRecord(sessionIntentInput());
    expect(legacy.status).toBe(ResultStatus.Success);
    expect(session.status).toBe(ResultStatus.Success);
    if (legacy.status !== ResultStatus.Success || session.status !== ResultStatus.Success) {
      throw new Error("mixed fixtures should parse");
    }
    expect(createActionJournalState(legacy.value as ActionIntentRecord).intent.schemaVersion).toBe(
      ACTION_JOURNAL_SCHEMA_VERSION,
    );
    expect(createActionJournalState(session.value as ActionIntentRecord).intent.schemaVersion).toBe(
      SESSION_ACTION_JOURNAL_SCHEMA_VERSION,
    );
  });

  it("拒绝 provenance、targets 和 record schema 漂移", () => {
    const intent = parseActionIntent(sessionIntentInput());
    expect(intent.status).toBe(ResultStatus.Success);
    if (intent.status !== ResultStatus.Success) throw intent.error;

    const state = createActionJournalState(intent.value);
    const changedProvenance = parseActionObservation({
      ...sessionObservationInput(),
      sessionProvenance: {
        ...sessionProvenance(),
        attemptNumber: 2,
      },
    });
    const changedTargets = parseActionObservation({
      ...sessionObservationInput(),
      targets: ["src/a.ts", "src/c.ts"],
    });
    const legacyObservation = parseActionObservation({
      ...sessionObservationInput(),
      schemaVersion: ACTION_JOURNAL_SCHEMA_VERSION,
      targets: undefined,
      sessionProvenance: undefined,
      trace: undefined,
    });

    expect(changedProvenance.status).toBe(ResultStatus.Success);
    expect(changedTargets.status).toBe(ResultStatus.Success);
    expect(legacyObservation.status).toBe(ResultStatus.Failure);
    if (changedProvenance.status === ResultStatus.Success) {
      expect(appendActionObservation(state, changedProvenance.value).status).toBe(
        ResultStatus.Failure,
      );
    }
    if (changedTargets.status === ResultStatus.Success) {
      expect(appendActionObservation(state, changedTargets.value).status).toBe(
        ResultStatus.Failure,
      );
    }
  });

  it("strict fail closed：attempt、target 与 trace 结构漂移", () => {
    expect(
      parseActionIntent({
        ...sessionIntentInput(),
        sessionProvenance: { ...sessionProvenance(), attemptNumber: 0 },
      }).status,
    ).toBe(ResultStatus.Failure);
    expect(parseActionIntent({ ...sessionIntentInput(), targets: ["src\\a.ts"] }).status).toBe(
      ResultStatus.Failure,
    );
    expect(
      parseActionObservation({
        ...sessionObservationInput(),
        trace: {
          observationDigest: "not-a-content-digest",
          disposition: SessionActionTraceDisposition.Persisted,
          recoveryPathDigests: [],
        },
      }).status,
    ).toBe(ResultStatus.Failure);
    expect(
      parseActionObservation({
        ...sessionObservationInput(),
        trace: {
          observationDigest: digest,
          disposition: SessionActionTraceDisposition.Dropped,
          recoveryPathDigests: [],
        },
      }).status,
    ).toBe(ResultStatus.Failure);
    expect(
      parseActionObservation({
        ...sessionObservationInput(),
        trace: {
          observationDigest: digest,
          disposition: SessionActionTraceDisposition.Persisted,
          dropReason: SessionActionTraceDropReason.IoFailure,
          recoveryPathDigests: [],
        },
      }).status,
    ).toBe(ResultStatus.Failure);
    const legacyTrace = sessionObservationInput();
    legacyTrace["trace"] = {
      disposition: SessionActionTraceDisposition.Persisted,
      recoveryPathDigests: [],
    };
    expect(parseActionObservation(legacyTrace).status).toBe(ResultStatus.Success);
    expect(
      parseActionObservation({
        ...sessionObservationInput(),
        trace: {
          observationDigest: digest,
          disposition: SessionActionTraceDisposition.Persisted,
          recoveryPathDigests: [digest, digest],
        },
      }).status,
    ).toBe(ResultStatus.Failure);
  });
});

function sessionProvenance(): Record<string, unknown> {
  return {
    sessionId: "01ARZ3NDEKTSV4RRFFQ69G5FAW",
    codingTaskId: "coding-task-a",
    attemptNumber: 1,
    worktreeId: "worktree-a",
    worktreeRootDigest: digest,
    activationBindingDigest: digest,
    sessionBindingDigest: digest,
    executorSessionIdDigest: digest,
  };
}

function sessionIntentInput(): Record<string, unknown> {
  return {
    schemaVersion: SESSION_ACTION_JOURNAL_SCHEMA_VERSION,
    recordType: ActionJournalRecordType.Intent,
    actionId,
    sequence: 1,
    workspaceId: "workspace-a",
    taskId: "01ARZ3NDEKTSV4RRFFQ69G5FAW",
    commandId: "command-session-a",
    correlationId: "correlation-session-a",
    idempotencyKey: "action-session-a",
    kind: ActionKind.FileMutation,
    target: "src/a.ts",
    targets: ["src/a.ts", "src/b.ts"],
    inputDigest: digest,
    postconditionDigest: digest,
    recoveryGuidance: "交由 Human 检查目标文件并决定恢复方式。",
    sessionProvenance: sessionProvenance(),
    actor,
    recordedAt: "2026-07-12T00:00:00.000Z",
  };
}

function sessionObservationInput(): Record<string, unknown> {
  return {
    schemaVersion: SESSION_ACTION_JOURNAL_SCHEMA_VERSION,
    recordType: ActionJournalRecordType.Observation,
    actionId,
    workspaceId: "workspace-a",
    taskId: "01ARZ3NDEKTSV4RRFFQ69G5FAW",
    sequence: 2,
    outcome: ActionOutcome.Succeeded,
    evidenceIds: ["evidence-session-a"],
    sessionProvenance: sessionProvenance(),
    targets: ["src/a.ts", "src/b.ts"],
    trace: {
      observationDigest: digest,
      disposition: SessionActionTraceDisposition.Persisted,
      recoveryPathDigests: [],
    },
    actor,
    recordedAt: "2026-07-12T00:01:00.000Z",
  };
}

function legacyIntentInput(): Record<string, unknown> {
  return {
    schemaVersion: ACTION_JOURNAL_SCHEMA_VERSION,
    recordType: ActionJournalRecordType.Intent,
    actionId: "01ARZ3NDEKTSV4RRFFQ69G5FAT",
    sequence: 1,
    workspaceId: "workspace-a",
    taskId: "01ARZ3NDEKTSV4RRFFQ69G5FAW",
    commandId: "command-legacy-a",
    correlationId: "correlation-legacy-a",
    idempotencyKey: "action-legacy-a",
    kind: ActionKind.FileMutation,
    target: "src/legacy.ts",
    inputDigest: digest,
    postconditionDigest: digest,
    recoveryGuidance: "交由 Human 检查目标文件。",
    actor,
    recordedAt: "2026-07-12T00:00:00.000Z",
  };
}

function resolutionInput(resolution: ActionResolution): ActionResolutionRecord {
  const parsed = parseActionResolution({
    schemaVersion: ACTION_JOURNAL_SCHEMA_VERSION,
    recordType: ActionJournalRecordType.Resolution,
    actionId,
    workspaceId: "workspace-a",
    taskId: "01ARZ3NDEKTSV4RRFFQ69G5FAW",
    sequence: 3,
    resolution,
    reason: "根据明确的 Succeeded outcome 完成提交。",
    actor,
    recordedAt: "2026-07-12T00:02:00.000Z",
  });
  if (parsed.status !== ResultStatus.Success) throw parsed.error;
  return parsed.value;
}
