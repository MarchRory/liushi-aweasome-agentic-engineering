import { describe, expect, it } from "vitest";

import {
  ACTION_JOURNAL_SCHEMA_VERSION,
  ActorKind,
  ActionJournalRecordType,
  ActionJournalStatus,
  ActionKind,
  ActionOutcome,
  ActionResolution,
  ResultStatus,
  WorktreeProvisionRecoveryInspectionStatus,
  createProvisionRecoveryObservation,
  createProvisionRecoveryResolution,
  parseActionId,
  parseContentDigest,
  parseTaskId,
  parseWorkspaceId,
  type ActionJournalState,
  type WorktreeProvisionRecoveryAssessment,
} from "../../src/index.js";

const cases = [
  [
    WorktreeProvisionRecoveryInspectionStatus.Applied,
    ActionOutcome.Succeeded,
    ActionResolution.Recovered,
  ],
  [
    WorktreeProvisionRecoveryInspectionStatus.NotApplied,
    ActionOutcome.NotApplied,
    ActionResolution.RetryPermitted,
  ],
  [
    WorktreeProvisionRecoveryInspectionStatus.HumanRequired,
    ActionOutcome.OutcomeUnknown,
    ActionResolution.HumanRequired,
  ],
  [
    WorktreeProvisionRecoveryInspectionStatus.Unavailable,
    ActionOutcome.OutcomeUnknown,
    ActionResolution.HumanRequired,
  ],
] as const;

describe("Worktree Provision Recovery Record Factory", () => {
  it.each(cases)("将 %s 映射为兼容的 Observation 与 Resolution", (status, outcome, resolution) => {
    const state = journalState();
    const observation = createProvisionRecoveryObservation(state, assessment(status), human, clock);
    const awaiting = { ...state, observations: [observation], lastSequence: 2 };

    expect(observation).toMatchObject({ outcome, sequence: 2, actor: human });
    expect(
      createProvisionRecoveryResolution(awaiting, assessment(status), human, clock),
    ).toMatchObject({ resolution, sequence: 3, actor: human });
  });
});

const human = { kind: ActorKind.Human, actorId: "reviewer" };
const clock = { now: () => new Date("2026-07-14T00:00:00.000Z") };
const parsedActionId = unwrap(parseActionId("01ARZ3NDEKTSV4RRFFQ69G5FC1"));
const parsedWorkspaceId = unwrap(parseWorkspaceId("workspace-1"));
const parsedTaskId = unwrap(parseTaskId("01ARZ3NDEKTSV4RRFFQ69G5FB2"));

function assessment(
  status: WorktreeProvisionRecoveryInspectionStatus,
): WorktreeProvisionRecoveryAssessment {
  return {
    schemaVersion: "1.0.0",
    workspaceId: "workspace-1",
    codingTaskId: "coding-task-1",
    actionId: "01ARZ3NDEKTSV4RRFFQ69G5FC1",
    repositoryId: "repository-1",
    worktreeId: "worktree-1",
    journalStatus: ActionJournalStatus.WaitingHuman,
    journalLastSequence: 1,
    status,
    diagnostics: [],
    evidenceIds: ["evidence-1"],
    digest: unwrap(parseContentDigest(`sha256:${"a".repeat(64)}`)),
  };
}

function journalState(): ActionJournalState {
  return {
    intent: {
      schemaVersion: ACTION_JOURNAL_SCHEMA_VERSION,
      recordType: ActionJournalRecordType.Intent,
      actionId: parsedActionId,
      sequence: 1,
      workspaceId: parsedWorkspaceId,
      taskId: parsedTaskId,
      commandId: "command-1",
      correlationId: "correlation-1",
      idempotencyKey: "idempotency-1",
      kind: ActionKind.GitMutation,
      target: "{}",
      inputDigest: unwrap(parseContentDigest(`sha256:${"b".repeat(64)}`)),
      postconditionDigest: unwrap(parseContentDigest(`sha256:${"c".repeat(64)}`)),
      recoveryGuidance: "由 Human 检查。",
      actor: human,
      recordedAt: "2026-07-14T00:00:00.000Z",
    },
    observations: [],
    resolutions: [],
    lastSequence: 1,
    status: ActionJournalStatus.WaitingHuman,
  };
}

function unwrap<T>(result: { status: ResultStatus; value?: T; error?: Error }): T {
  if (result.status !== ResultStatus.Success || result.value === undefined) {
    throw new Error(result.error?.message ?? "测试值解析失败。");
  }
  return result.value;
}
