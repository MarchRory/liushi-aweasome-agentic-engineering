/* eslint-disable @typescript-eslint/require-await */
import { describe, expect, it } from "vitest";

import {
  ActionJournalStatus,
  ActionOutcome,
  ActionResolution,
  HarnessErrorCode,
  PilotAttestation,
  PilotExecutionMode,
  PilotHumanTouchSource,
  PilotMetricsClaimEligibility,
  PilotMetricsCreateDisposition,
  PilotMetricsReportStatus,
  PilotQualityFactKind,
  PilotStepOutcome,
  ResultStatus,
  success,
  createPilotMetricsEnrollment,
  createPilotMetricsSettlement,
  PilotMetricsService,
} from "../../src/index.js";
import {
  createPilotMetricsFixture,
  enableActivation,
  enrollmentDraft,
  pilotMetricsIds,
  settlementDraft,
} from "../support/pilotMetrics/index.js";

const claimBlockedCases: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
  ["incomplete", { attestation: PilotAttestation.Incomplete }],
  ["verification failed", { evidenceStatus: "failed" }],
  [
    "security",
    {
      qualityFacts: [
        {
          factId: "fact-security",
          kind: PilotQualityFactKind.SecurityIncident,
          evidenceDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
      ],
    },
  ],
  [
    "privacy",
    {
      qualityFacts: [
        {
          factId: "fact-privacy",
          kind: PilotQualityFactKind.PrivacyIncident,
          evidenceDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
      ],
    },
  ],
  [
    "outcome unknown",
    {
      qualityFacts: [
        {
          factId: "fact-unknown",
          kind: PilotQualityFactKind.OutcomeUnknown,
          evidenceDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
      ],
    },
  ],
];

/** 证据来源漂移 Fake 的可枚举分支。 */
enum EvidenceDriftSource {
  /** Activation 记录。 */
  Activation = "activation",
  /** Agent Process Evidence。 */
  Process = "process",
  /** Closeout State。 */
  Closeout = "closeout",
  /** Verification EvidenceBundle。 */
  Bundle = "bundle",
  /** 生成 Verification EvidenceBundle 的 Action Journal。 */
  Journal = "journal",
}

const evidenceDriftCases: ReadonlyArray<
  readonly [
    string,
    EvidenceDriftSource,
    (fixture: ReturnType<typeof createPilotMetricsFixture>) => unknown,
  ]
> = [
  [
    "Activation workspace",
    EvidenceDriftSource.Activation,
    (f) => ({ ...f.activation, workspaceId: "workspace-drift" }),
  ],
  [
    "Activation session",
    EvidenceDriftSource.Activation,
    (f) => ({ ...f.activation, sessionId: "01J00000000000000000000001" }),
  ],
  [
    "Activation codingTask",
    EvidenceDriftSource.Activation,
    (f) => ({ ...f.activation, codingTaskId: "task-drift" }),
  ],
  [
    "Activation repository",
    EvidenceDriftSource.Activation,
    (f) => ({ ...f.activation, repositoryId: "repo-drift" }),
  ],
  [
    "Activation worktree",
    EvidenceDriftSource.Activation,
    (f) => ({ ...f.activation, worktreeId: "worktree-drift" }),
  ],
  [
    "Process workspace",
    EvidenceDriftSource.Process,
    (f) => ({ ...f.processEvidence, workspaceId: "workspace-drift" }),
  ],
  [
    "Process session",
    EvidenceDriftSource.Process,
    (f) => ({ ...f.processEvidence, sessionId: "01J00000000000000000000001" }),
  ],
  [
    "Process codingTask",
    EvidenceDriftSource.Process,
    (f) => ({ ...f.processEvidence, codingTaskId: "task-drift" }),
  ],
  [
    "Process worktree",
    EvidenceDriftSource.Process,
    (f) => ({ ...f.processEvidence, worktreeId: "worktree-drift" }),
  ],
  [
    "Process attempt",
    EvidenceDriftSource.Process,
    (f) => ({ ...f.processEvidence, attemptNumber: 2 }),
  ],
  [
    "Process completed after closeout",
    EvidenceDriftSource.Process,
    (f) => ({ ...f.processEvidence, completedAt: "2026-07-30T09:09:00.000Z" }),
  ],
  [
    "Closeout workspace",
    EvidenceDriftSource.Closeout,
    (f) => ({ ...f.closeoutState, workspaceId: "workspace-drift" }),
  ],
  [
    "Closeout session",
    EvidenceDriftSource.Closeout,
    (f) => ({ ...f.closeoutState, sessionId: "01J00000000000000000000001" }),
  ],
  [
    "Closeout codingTask",
    EvidenceDriftSource.Closeout,
    (f) => ({ ...f.closeoutState, codingTaskId: "task-drift" }),
  ],
  [
    "Closeout repository",
    EvidenceDriftSource.Closeout,
    (f) => ({ ...f.closeoutState, repositoryId: "repo-drift" }),
  ],
  [
    "Closeout worktree",
    EvidenceDriftSource.Closeout,
    (f) => ({
      ...f.closeoutState,
      snapshot: { ...f.closeoutState.snapshot, worktreeId: "worktree-drift" },
    }),
  ],
  [
    "Closeout attempt",
    EvidenceDriftSource.Closeout,
    (f) => ({ ...f.closeoutState, attemptNumber: 2 }),
  ],
  [
    "Closeout baseRevision",
    EvidenceDriftSource.Closeout,
    (f) => ({
      ...f.closeoutState,
      snapshot: { ...f.closeoutState.snapshot, baseRevision: "base-drift" },
    }),
  ],
  [
    "Bundle repository",
    EvidenceDriftSource.Bundle,
    (f) => ({ ...f.evidenceBundle, repositoryId: "repo-drift" }),
  ],
  [
    "Bundle worktree",
    EvidenceDriftSource.Bundle,
    (f) => ({ ...f.evidenceBundle, worktreeId: "worktree-drift" }),
  ],
  [
    "Bundle verificationRunId",
    EvidenceDriftSource.Bundle,
    (f) => ({ ...f.evidenceBundle, verificationRunId: "verification-drift" }),
  ],
  [
    "Bundle baseRevision",
    EvidenceDriftSource.Bundle,
    (f) => ({ ...f.evidenceBundle, baseRevision: "base-drift" }),
  ],
  [
    "Bundle targetRevision",
    EvidenceDriftSource.Bundle,
    (f) => ({ ...f.evidenceBundle, targetRevision: "target-drift" }),
  ],
  [
    "Journal action",
    EvidenceDriftSource.Journal,
    (f) => ({
      ...f.verificationActionJournal,
      intent: { ...f.verificationActionJournal.intent, actionId: "01ARZ3NDEKTSV4RRFFQ69G5FEY" },
    }),
  ],
  [
    "Journal outputDigest",
    EvidenceDriftSource.Journal,
    (f) => ({
      ...f.verificationActionJournal,
      observations: f.verificationActionJournal.observations.map((observation) => ({
        ...observation,
        outputDigest: `sha256:${"d".repeat(64)}`,
      })),
    }),
  ],
  [
    "Journal status",
    EvidenceDriftSource.Journal,
    (f) => ({
      ...f.verificationActionJournal,
      status: ActionJournalStatus.WaitingHuman,
    }),
  ],
  [
    "Journal chronology",
    EvidenceDriftSource.Journal,
    (f) => ({
      ...f.verificationActionJournal,
      resolutions: f.verificationActionJournal.resolutions.map((resolution) => ({
        ...resolution,
        recordedAt: "2026-07-30T09:11:00.000Z",
      })),
    }),
  ],
  [
    "Journal retry chronology",
    EvidenceDriftSource.Journal,
    (f) => ({
      ...f.verificationActionJournal,
      observations: [
        {
          ...f.verificationActionJournal.observations[0],
          sequence: 2,
          outcome: ActionOutcome.NotApplied,
          recordedAt: "2026-07-30T09:30:00.000Z",
        },
        {
          ...f.verificationActionJournal.observations[0],
          sequence: 4,
        },
      ],
      resolutions: [
        {
          ...f.verificationActionJournal.resolutions[0],
          sequence: 3,
          resolution: ActionResolution.RetryPermitted,
          recordedAt: "2026-07-30T09:31:00.000Z",
        },
        {
          ...f.verificationActionJournal.resolutions[0],
          sequence: 5,
        },
      ],
      lastSequence: 5,
    }),
  ],
];

function makeEnrollment(
  fixture = createPilotMetricsFixture(),
  overrides: Record<string, unknown> = {},
) {
  const result = createPilotMetricsEnrollment(enrollmentDraft(overrides), fixture.digest);
  if (result.status === ResultStatus.Failure) throw result.error;
  return { fixture, service: new PilotMetricsService(fixture.dependencies), value: result.value };
}

function makeSettlement(
  enrollment: ReturnType<typeof makeEnrollment>["value"],
  fixture = createPilotMetricsFixture(),
  overrides: Record<string, unknown> = {},
) {
  const result = createPilotMetricsSettlement(
    settlementDraft(enrollment, overrides),
    fixture.digest,
  );
  if (result.status === ResultStatus.Failure) throw result.error;
  return result.value;
}

describe("PilotMetricsService", () => {
  it("首次 Enrollment 成功、相同内容 replay reused、不同内容 conflict", async () => {
    const setup = makeEnrollment();
    const first = await setup.service.enroll(enrollmentDraft());
    const replay = await setup.service.enroll(enrollmentDraft());
    const changed = await setup.service.enroll(enrollmentDraft({ taskClass: "bug_fix" }));

    expect(first).toMatchObject({
      status: ResultStatus.Success,
      value: { disposition: PilotMetricsCreateDisposition.Created },
    });
    expect(replay).toMatchObject({
      status: ResultStatus.Success,
      value: { disposition: PilotMetricsCreateDisposition.Reused },
    });
    expect(changed).toMatchObject({
      status: ResultStatus.Success,
      value: { disposition: PilotMetricsCreateDisposition.Conflict },
    });
  });

  it("已有 Activation 时拒绝新 Enrollment，但 Activation 后既有 Enrollment 仍可幂等 replay", async () => {
    const setup = makeEnrollment();
    const first = await setup.service.enroll(enrollmentDraft());
    expect(first.status).toBe(ResultStatus.Success);
    Object.assign(setup.fixture.dependencies, {
      activationRepository: {
        ...setup.fixture.dependencies.activationRepository,
        load: async () => ({
          status: ResultStatus.Success as const,
          value: setup.fixture.activation,
        }),
      },
    });

    const replay = await setup.service.enroll(enrollmentDraft());
    const changed = await setup.service.enroll(enrollmentDraft({ riskLevel: "high" }));
    expect(replay).toMatchObject({
      status: ResultStatus.Success,
      value: { disposition: PilotMetricsCreateDisposition.Reused },
    });
    expect(changed).toMatchObject({
      status: ResultStatus.Success,
      value: { disposition: PilotMetricsCreateDisposition.Conflict },
    });

    const fresh = makeEnrollment();
    Object.assign(fresh.fixture.dependencies, {
      activationRepository: {
        ...fresh.fixture.dependencies.activationRepository,
        load: async () => ({
          status: ResultStatus.Success as const,
          value: fresh.fixture.activation,
        }),
      },
    });
    const rejected = await fresh.service.enroll(enrollmentDraft());
    expect(rejected).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.PreconditionNotMet },
    });
  });

  it("settle 精确绑定 Enrollment、要求步骤集合完全一致，并拒绝 Required 非执行结果和未知 Quality step", async () => {
    const setup = makeEnrollment();
    const enrolled = await setup.service.enroll(enrollmentDraft());
    if (enrolled.status === ResultStatus.Failure) throw enrolled.error;
    const enrollment = enrolled.value.record;

    const mismatch = await setup.service.settle(
      settlementDraft(enrollment, { codingTaskId: "task-other" }),
    );
    const missingStep = await setup.service.settle(
      settlementDraft(enrollment, {
        stepFacts: [
          {
            stepId: "plan",
            actualExecutionMode: PilotExecutionMode.Human,
            outcome: PilotStepOutcome.Completed,
            attemptCount: 1,
            evidenceDigests: [],
          },
        ],
      }),
    );
    const skippedRequired = await setup.service.settle(
      settlementDraft(enrollment, {
        stepFacts: enrollment.plannedSteps.map((step) => ({
          stepId: step.stepId,
          actualExecutionMode: step.expectedExecutionMode,
          outcome: step.stepId === "plan" ? PilotStepOutcome.Skipped : PilotStepOutcome.Completed,
          attemptCount: 1,
          evidenceDigests: [],
        })),
      }),
    );
    const notExecutedRequired = await setup.service.settle(
      settlementDraft(enrollment, {
        stepFacts: enrollment.plannedSteps.map((step) => ({
          stepId: step.stepId,
          actualExecutionMode:
            step.stepId === "plan" ? PilotExecutionMode.NotExecuted : step.expectedExecutionMode,
          outcome: PilotStepOutcome.Completed,
          attemptCount: 1,
          evidenceDigests: [],
        })),
      }),
    );
    const unknownQualityStep = await setup.service.settle(
      settlementDraft(enrollment, {
        qualityFacts: [
          {
            factId: "fact-1",
            kind: PilotQualityFactKind.Rework,
            stepId: "unknown-step",
            evidenceDigest: enrollment.recordDigest,
          },
        ],
      }),
    );

    for (const result of [
      mismatch,
      missingStep,
      skippedRequired,
      notExecutedRequired,
      unknownQualityStep,
    ]) {
      expect(result.status).toBe(ResultStatus.Failure);
      expect(result).toMatchObject({ error: { code: HarnessErrorCode.PreconditionNotMet } });
    }
  });

  it("默认拒绝 observed Human Touch，reported 可用，not_measured 不得带区间且区间须在边界内", async () => {
    const setup = makeEnrollment();
    const enrolled = await setup.service.enroll(enrollmentDraft());
    if (enrolled.status === ResultStatus.Failure) throw enrolled.error;
    const enrollment = enrolled.value.record;
    const observed = await setup.service.settle(
      settlementDraft(enrollment, {
        humanTouchEntries: [
          {
            entryId: "touch-observed",
            category: "review",
            source: PilotHumanTouchSource.Observed,
            startedAt: "2026-07-30T09:01:00.000Z",
            completedAt: "2026-07-30T09:02:00.000Z",
            durationMs: 60000,
          },
        ],
      }),
    );
    expect(observed).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.PreconditionNotMet },
    });

    enableActivation(setup.fixture);
    const reported = await setup.service.settle(settlementDraft(enrollment));
    expect(reported.status).toBe(ResultStatus.Success);

    const notMeasuredWithTouch = await setup.service.settle(
      settlementDraft(enrollment, { attestation: PilotAttestation.NotMeasured }),
    );
    const outsideBoundary = await setup.service.settle(
      settlementDraft(enrollment, {
        humanTouchEntries: [
          {
            entryId: "touch-outside",
            category: "review",
            source: PilotHumanTouchSource.Reported,
            startedAt: "2026-07-30T08:59:00.000Z",
            completedAt: "2026-07-30T09:00:30.000Z",
            durationMs: 90000,
          },
        ],
      }),
    );
    setup.fixture.store.settlement = null;
    const notMeasuredFresh = await setup.service.settle(
      settlementDraft(enrollment, { attestation: PilotAttestation.NotMeasured }),
    );
    expect(notMeasuredFresh).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.PreconditionNotMet },
    });
    expect(notMeasuredWithTouch).toMatchObject({ status: ResultStatus.Success });
    setup.fixture.store.settlement = null;
    const outsideBoundaryFresh = await setup.service.settle(
      settlementDraft(enrollment, {
        humanTouchEntries: [
          {
            entryId: "touch-outside",
            category: "review",
            source: PilotHumanTouchSource.Reported,
            startedAt: "2026-07-30T08:59:00.000Z",
            completedAt: "2026-07-30T09:00:30.000Z",
            durationMs: 90000,
          },
        ],
      }),
    );
    expect(outsideBoundary).toMatchObject({ status: ResultStatus.Success });
    expect(outsideBoundaryFresh).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.PreconditionNotMet },
    });
  });

  it.each(evidenceDriftCases)("证据绑定拒绝 %s 漂移", async (_name, source, drift) => {
    const fixture = createPilotMetricsFixture();
    const service = new PilotMetricsService(fixture.dependencies);
    const enrollmentResult = createPilotMetricsEnrollment(enrollmentDraft(), fixture.digest);
    if (enrollmentResult.status === ResultStatus.Failure) throw enrollmentResult.error;
    const settlement = makeSettlement(enrollmentResult.value, fixture);
    enableActivation(fixture);
    fixture.store.enrollment = enrollmentResult.value;
    fixture.store.settlement = null;
    const key =
      source === EvidenceDriftSource.Activation
        ? "activationRepository"
        : source === EvidenceDriftSource.Process
          ? "processEvidenceStore"
          : source === EvidenceDriftSource.Closeout
            ? "closeoutStateStore"
            : source === EvidenceDriftSource.Journal
              ? "actionJournalRepository"
              : "evidenceBundleStore";
    if (key === "activationRepository")
      Object.assign(fixture.dependencies, {
        activationRepository: {
          ...fixture.dependencies.activationRepository,
          load: async () => ({
            status: ResultStatus.Success as const,
            value: drift(fixture) as never,
          }),
        },
      });
    if (key === "processEvidenceStore")
      Object.assign(fixture.dependencies, {
        processEvidenceStore: {
          ...fixture.dependencies.processEvidenceStore,
          load: async () => ({
            status: ResultStatus.Success as const,
            value: drift(fixture) as never,
          }),
        },
      });
    if (key === "closeoutStateStore")
      Object.assign(fixture.dependencies, {
        closeoutStateStore: {
          ...fixture.dependencies.closeoutStateStore,
          load: async () => ({
            status: ResultStatus.Success as const,
            value: drift(fixture) as never,
          }),
        },
      });
    if (key === "actionJournalRepository")
      Object.assign(fixture.dependencies, {
        actionJournalRepository: {
          ...fixture.dependencies.actionJournalRepository,
          load: async () => ({
            status: ResultStatus.Success as const,
            value: drift(fixture) as never,
          }),
        },
      });
    if (key === "evidenceBundleStore")
      Object.assign(fixture.dependencies, {
        evidenceBundleStore: {
          ...fixture.dependencies.evidenceBundleStore,
          load: async () => ({
            status: ResultStatus.Success as const,
            value: drift(fixture) as never,
          }),
        },
      });
    fixture.store.settlement = settlement;
    const result = await service.report(pilotMetricsIds);
    expect(result).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.PreconditionNotMet },
    });
  });

  it("证据 chronology 漂移时拒绝 settlement", async () => {
    const fixture = createPilotMetricsFixture();
    const enrollmentResult = createPilotMetricsEnrollment(enrollmentDraft(), fixture.digest);
    if (enrollmentResult.status === ResultStatus.Failure) throw enrollmentResult.error;
    enableActivation(fixture);
    fixture.store.enrollment = enrollmentResult.value;
    fixture.store.settlement = makeSettlement(enrollmentResult.value, fixture, {
      settledAt: "2026-07-30T09:06:30.000Z",
    });
    const result = await new PilotMetricsService(fixture.dependencies).report(pilotMetricsIds);
    expect(result).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.PreconditionNotMet },
    });
  });

  it("machineDurationMs 只进入 evidence projection，报告不生成自动化率、人类总时长或效率字段", async () => {
    const setup = makeEnrollment();
    const enrollmentResult = await setup.service.enroll(enrollmentDraft());
    if (enrollmentResult.status === ResultStatus.Failure) throw enrollmentResult.error;
    const settlement = makeSettlement(enrollmentResult.value.record, setup.fixture);
    enableActivation(setup.fixture);
    setup.fixture.store.settlement = settlement;
    const report = await setup.service.report(pilotMetricsIds);
    expect(report).toMatchObject({
      status: ResultStatus.Success,
      value: {
        evidence: {
          machineDurationMs: 60000,
          verificationActionId: setup.fixture.verificationActionJournal.intent.actionId,
          verificationActionStatus: ActionJournalStatus.Committed,
        },
      },
    });
    if (report.status === ResultStatus.Success) {
      expect(report.value).not.toHaveProperty("automationRate");
      expect(report.value).not.toHaveProperty("humanTouchTotal");
      expect(report.value).not.toHaveProperty("efficiencyGain");
      expect(report.value.evidence).not.toHaveProperty("humanTouchTotal");
    }
  });

  it("report 状态区分：无 enrollment/仅 enrollment 为 not_measured，孤立 settlement 为 corrupt，完整证据 descriptive_available", async () => {
    const empty = createPilotMetricsFixture();
    const emptyReport = await new PilotMetricsService(empty.dependencies).report(pilotMetricsIds);
    expect(emptyReport).toMatchObject({
      status: ResultStatus.Success,
      value: { status: PilotMetricsReportStatus.NotMeasured },
    });

    const onlyEnrollment = makeEnrollment();
    const enrolled = await onlyEnrollment.service.enroll(enrollmentDraft());
    expect(enrolled.status).toBe(ResultStatus.Success);
    const onlyEnrollmentReport = await onlyEnrollment.service.report(pilotMetricsIds);
    expect(onlyEnrollmentReport).toMatchObject({
      status: ResultStatus.Success,
      value: { status: PilotMetricsReportStatus.NotMeasured },
    });

    const orphan = createPilotMetricsFixture();
    const enrollmentResult = createPilotMetricsEnrollment(enrollmentDraft(), orphan.digest);
    if (enrollmentResult.status === ResultStatus.Failure) throw enrollmentResult.error;
    enableActivation(orphan);
    orphan.store.settlement = makeSettlement(enrollmentResult.value, orphan);
    const orphanReport = await new PilotMetricsService(orphan.dependencies).report(pilotMetricsIds);
    expect(orphanReport).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.CorruptStore },
    });

    const complete = makeEnrollment();
    const completeEnrollment = await complete.service.enroll(enrollmentDraft());
    if (completeEnrollment.status === ResultStatus.Failure) throw completeEnrollment.error;
    enableActivation(complete.fixture);
    complete.fixture.store.settlement = makeSettlement(
      completeEnrollment.value.record,
      complete.fixture,
    );
    const completeReport = await complete.service.report(pilotMetricsIds);
    if (completeReport.status === ResultStatus.Failure) throw completeReport.error;
    expect(completeReport).toMatchObject({
      status: ResultStatus.Success,
      value: {
        status: PilotMetricsReportStatus.DescriptiveAvailable,
        claimEligibility: PilotMetricsClaimEligibility.DescriptiveOnly,
      },
    });
  });

  it.each(claimBlockedCases)("%s 会将 claimEligibility 置为 blocked", async (_name, overrides) => {
    const fixture = createPilotMetricsFixture();
    const enrollmentResult = createPilotMetricsEnrollment(enrollmentDraft(), fixture.digest);
    if (enrollmentResult.status === ResultStatus.Failure) throw enrollmentResult.error;
    const settlementOverrides = { ...overrides };
    delete settlementOverrides["evidenceStatus"];
    const settlement = makeSettlement(enrollmentResult.value, fixture, settlementOverrides);
    enableActivation(fixture);
    fixture.store.enrollment = enrollmentResult.value;
    fixture.store.settlement = settlement;
    if ("evidenceStatus" in overrides) {
      const evidenceBundle = {
        ...fixture.evidenceBundle,
        status: overrides["evidenceStatus"],
      } as never;
      const outputDigest = fixture.digest.calculate(evidenceBundle).value;
      Object.assign(fixture.dependencies, {
        evidenceBundleStore: {
          ...fixture.dependencies.evidenceBundleStore,
          load: async () => success(evidenceBundle),
        },
        actionJournalRepository: {
          ...fixture.dependencies.actionJournalRepository,
          load: async () =>
            success({
              ...fixture.verificationActionJournal,
              observations: fixture.verificationActionJournal.observations.map((observation) => ({
                ...observation,
                outputDigest,
              })),
            }),
        },
      });
    }
    const result = await new PilotMetricsService(fixture.dependencies).report(pilotMetricsIds);
    expect(result).toMatchObject({
      status: ResultStatus.Success,
      value: {
        status: PilotMetricsReportStatus.DescriptiveAvailable,
        claimEligibility: PilotMetricsClaimEligibility.Blocked,
      },
    });
  });
});
