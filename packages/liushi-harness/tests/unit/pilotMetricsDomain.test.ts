import { describe, expect, it } from "vitest";

import {
  ActorKind,
  PilotAttestation,
  PilotExecutionMode,
  PilotHumanTouchCategory,
  PilotHumanTouchSource,
  PilotQualityFactKind,
  PilotRiskLevel,
  PilotStepOutcome,
  PilotStepPhase,
  PilotTaskClass,
  ResultStatus,
  createPilotMetricsEnrollment,
  createPilotMetricsSettlement,
  rebuildPilotMetricsEnrollment,
} from "../../src/index.js";
import { Rfc8785Sha256DigestAdapter } from "../../src/infrastructure/index.js";

const digest = new Rfc8785Sha256DigestAdapter();

function enrollmentDraft(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    pilotId: "pilot-1",
    workspaceId: "workspace-1",
    sessionId: "01J00000000000000000000000",
    codingTaskId: "task-1",
    repositoryId: "repo-1",
    taskClass: PilotTaskClass.Feature,
    riskLevel: PilotRiskLevel.Medium,
    historicalLogicChange: false,
    plannedWritePathCount: 1,
    requiredValidatorCount: 1,
    repositoryRevision: "abc123",
    harnessRevision: "harness-1",
    policyDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    plannedSteps: [
      {
        stepId: "plan",
        phase: PilotStepPhase.Plan,
        required: true,
        expectedExecutionMode: PilotExecutionMode.Human,
      },
      {
        stepId: "verify",
        phase: PilotStepPhase.Verify,
        required: true,
        expectedExecutionMode: PilotExecutionMode.Automated,
      },
    ],
    enrolledAt: "2026-07-30T09:00:00.000Z",
    actor: { kind: ActorKind.Human, actorId: "human-1" },
    ...overrides,
  };
}

describe("Pilot Metrics domain", () => {
  it("creates and strictly rebuilds immutable Enrollment with a recalculated digest", () => {
    const created = createPilotMetricsEnrollment(enrollmentDraft(), digest);
    expect(created.status).toBe(ResultStatus.Success);
    if (created.status === ResultStatus.Failure) return;

    const rebuilt = rebuildPilotMetricsEnrollment(created.value, digest);
    expect(rebuilt).toEqual(created);
    if (rebuilt.status === ResultStatus.Failure) return;
    expect(Object.isFrozen(rebuilt.value)).toBe(true);
    expect(Object.isFrozen(rebuilt.value.plannedSteps)).toBe(true);

    const drifted = { ...created.value, taskClass: PilotTaskClass.BugFix };
    expect(rebuildPilotMetricsEnrollment(drifted, digest).status).toBe(ResultStatus.Failure);
    expect(
      rebuildPilotMetricsEnrollment({ ...created.value, schemaVersion: "unknown" }, digest).status,
    ).toBe(ResultStatus.Failure);
  });

  it("rejects unknown enums, duplicate IDs, overlapping intervals and mismatched durations", () => {
    expect(
      createPilotMetricsEnrollment(enrollmentDraft({ taskClass: "unknown" }), digest).status,
    ).toBe(ResultStatus.Failure);
    expect(
      createPilotMetricsEnrollment(
        enrollmentDraft({ actor: { kind: ActorKind.Agent, actorId: "agent-1" } }),
        digest,
      ).status,
    ).toBe(ResultStatus.Failure);
    expect(
      createPilotMetricsEnrollment(
        enrollmentDraft({ actor: { kind: ActorKind.Human, actorId: "alice@example.com" } }),
        digest,
      ).status,
    ).toBe(ResultStatus.Failure);
    expect(
      createPilotMetricsEnrollment(
        enrollmentDraft({ actor: { kind: ActorKind.Human, actorId: "C:\\Users\\Alice" } }),
        digest,
      ).status,
    ).toBe(ResultStatus.Failure);
    const duplicateDraft = enrollmentDraft();
    const plannedSteps = duplicateDraft["plannedSteps"] as unknown[];
    duplicateDraft["plannedSteps"] = [plannedSteps[0], plannedSteps[0]];
    expect(createPilotMetricsEnrollment(duplicateDraft, digest).status).toBe(ResultStatus.Failure);
    const notExecutedDraft = enrollmentDraft();
    const firstStep = (notExecutedDraft["plannedSteps"] as Array<Record<string, unknown>>)[0];
    if (firstStep === undefined) throw new Error("fixture step missing");
    firstStep["expectedExecutionMode"] = PilotExecutionMode.NotExecuted;
    expect(createPilotMetricsEnrollment(notExecutedDraft, digest).status).toBe(
      ResultStatus.Failure,
    );

    const enrollment = createPilotMetricsEnrollment(enrollmentDraft(), digest);
    if (enrollment.status === ResultStatus.Failure) throw enrollment.error;
    const invalidSettlement = {
      pilotId: enrollment.value.pilotId,
      workspaceId: enrollment.value.workspaceId,
      sessionId: enrollment.value.sessionId,
      codingTaskId: enrollment.value.codingTaskId,
      repositoryId: enrollment.value.repositoryId,
      enrollmentDigest: enrollment.value.recordDigest,
      verificationRunId: "verification-1",
      verificationActionId: "01ARZ3NDEKTSV4RRFFQ69G5FEX",
      humanTouchEntries: [
        {
          entryId: "touch-1",
          category: PilotHumanTouchCategory.Review,
          source: PilotHumanTouchSource.Reported,
          startedAt: "2026-07-30T09:00:00.000Z",
          completedAt: "2026-07-30T09:00:02.000Z",
          durationMs: 3,
        },
        {
          entryId: "touch-2",
          category: PilotHumanTouchCategory.Review,
          source: PilotHumanTouchSource.Observed,
          startedAt: "2026-07-30T09:00:01.000Z",
          completedAt: "2026-07-30T09:00:03.000Z",
          durationMs: 2,
        },
      ],
      stepFacts: [
        {
          stepId: "plan",
          actualExecutionMode: PilotExecutionMode.Human,
          outcome: PilotStepOutcome.Completed,
          attemptCount: 1,
          evidenceDigests: [],
        },
      ],
      qualityFacts: [
        {
          factId: "fact-1",
          kind: PilotQualityFactKind.Rework,
          evidenceDigest: enrollment.value.recordDigest,
        },
      ],
      attestation: PilotAttestation.Complete,
      settledAt: "2026-07-30T09:00:03.000Z",
      actor: { kind: ActorKind.Human, actorId: "human-1" },
    };
    expect(createPilotMetricsSettlement(invalidSettlement, digest).status).toBe(
      ResultStatus.Failure,
    );
  });
});
