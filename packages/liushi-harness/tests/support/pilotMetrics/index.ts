/* eslint-disable @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/require-await, jsdoc/require-jsdoc */
import { createHash } from "node:crypto";

import {
  ACTION_JOURNAL_SCHEMA_VERSION,
  ActionJournalRecordType,
  ActionJournalStatus,
  ActionKind,
  ActionOutcome,
  ActionResolution,
  CodingTaskSessionCloseoutStatus,
  HarnessError,
  HarnessErrorCode,
  PilotAttestation,
  PilotExecutionMode,
  PilotHumanTouchCategory,
  PilotHumanTouchSource,
  PilotMetricsCreateDisposition,
  PilotRiskLevel,
  PilotStepOutcome,
  PilotStepPhase,
  PilotTaskClass,
  success,
  failure,
  type ContentDigest,
  type ContentDigestPort,
  type PilotMetricsApplicationDependencies,
  type PilotMetricsStore,
  type CodingTaskSessionActivationRecord,
  type AgentSessionProcessEvidence,
  type ActionJournalState,
  type CodingTaskSessionCloseoutState,
  type EvidenceBundle,
  type PilotEnrollment,
  type PilotSettlement,
} from "../../../src/index.js";

const DIGEST_PREFIX = "sha256:";
const WORKSPACE_ID = "workspace-1";
const SESSION_ID = "01J00000000000000000000000";
const CODING_TASK_ID = "task-1";
const REPOSITORY_ID = "repo-1";
const BASE_REVISION = "base-1";
const TARGET_REVISION = "target-1";
const WORKTREE_ID = "worktree-1";
const VERIFICATION_ACTION_ID = "01ARZ3NDEKTSV4RRFFQ69G5FEX";
const ACTIVATION_DIGEST = `${DIGEST_PREFIX}${"b".repeat(64)}` as ContentDigest;
const EVIDENCE_DIGEST = `${DIGEST_PREFIX}${"c".repeat(64)}` as ContentDigest;

export const pilotMetricsIds = {
  workspaceId: WORKSPACE_ID,
  sessionId: SESSION_ID,
  codingTaskId: CODING_TASK_ID,
  repositoryId: REPOSITORY_ID,
};

export class FakeContentDigestPort implements ContentDigestPort {
  public calculate(input: unknown) {
    const hex = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    return success(`${DIGEST_PREFIX}${hex}` as ContentDigest);
  }
}

export class FakePilotMetricsStore implements PilotMetricsStore {
  public enrollment: PilotEnrollment | null = null;
  public settlement: PilotSettlement | null = null;

  public async createEnrollment(enrollment: PilotEnrollment) {
    const disposition =
      this.enrollment === null
        ? PilotMetricsCreateDisposition.Created
        : this.enrollment.recordDigest === enrollment.recordDigest
          ? PilotMetricsCreateDisposition.Reused
          : PilotMetricsCreateDisposition.Conflict;
    if (this.enrollment === null) this.enrollment = enrollment;
    return success({ disposition, record: enrollment });
  }

  public async findEnrollment() {
    return success(this.enrollment);
  }

  public async loadEnrollment() {
    return this.enrollment === null
      ? failure(new HarnessError(HarnessErrorCode.CodingTaskNotFound, "enrollment missing"))
      : success(this.enrollment);
  }

  public async createSettlement(settlement: PilotSettlement) {
    const disposition =
      this.settlement === null
        ? PilotMetricsCreateDisposition.Created
        : this.settlement.recordDigest === settlement.recordDigest
          ? PilotMetricsCreateDisposition.Reused
          : PilotMetricsCreateDisposition.Conflict;
    if (this.settlement === null) this.settlement = settlement;
    return success({ disposition, record: settlement });
  }

  public async findSettlement() {
    return success(this.settlement);
  }

  public async loadSettlement() {
    return this.settlement === null
      ? failure(new HarnessError(HarnessErrorCode.CodingTaskNotFound, "settlement missing"))
      : success(this.settlement);
  }
}

export interface PilotMetricsFixture {
  readonly digest: FakeContentDigestPort;
  readonly store: FakePilotMetricsStore;
  readonly activation: CodingTaskSessionActivationRecord;
  readonly processEvidence: AgentSessionProcessEvidence;
  readonly closeoutState: CodingTaskSessionCloseoutState;
  readonly evidenceBundle: EvidenceBundle;
  readonly verificationActionJournal: ActionJournalState;
  readonly dependencies: PilotMetricsApplicationDependencies;
}

/** Enrollment 成功后切换到可加载 Activation 的状态。 */
export function enableActivation(fixture: PilotMetricsFixture): void {
  Object.assign(fixture.dependencies, {
    activationRepository: {
      ...fixture.dependencies.activationRepository,
      load: async () => success(fixture.activation),
    },
  });
}

/** 构造一组不依赖 Git、文件系统或真实 Verification 的最小权威证据。 */
export function createPilotMetricsFixture(): PilotMetricsFixture {
  const digest = new FakeContentDigestPort();
  const store = new FakePilotMetricsStore();
  const activation = {
    schemaVersion: "coding-task-session.activation.v1",
    workspaceId: WORKSPACE_ID,
    sessionId: SESSION_ID,
    codingTaskId: CODING_TASK_ID,
    sourceTaskId: "source-task-1",
    repositoryId: REPOSITORY_ID,
    attemptNumber: 1,
    attemptStartedAt: "2026-07-30T09:04:00.000Z",
    worktreeId: WORKTREE_ID,
    worktreeRootDigest: EVIDENCE_DIGEST,
    planRiskArtifactId: "artifact-1",
    planRiskArtifactDigest: EVIDENCE_DIGEST,
    agentActorId: "agent-1",
    activatedAt: "2026-07-30T09:05:00.000Z",
    bindingDigest: ACTIVATION_DIGEST,
  } as unknown as CodingTaskSessionActivationRecord;
  const processEvidence = {
    schemaVersion: "agent-session.process-evidence.v1",
    workspaceId: WORKSPACE_ID,
    sessionId: SESSION_ID,
    codingTaskId: CODING_TASK_ID,
    sourceTaskId: "source-task-1",
    attemptNumber: 1,
    worktreeId: WORKTREE_ID,
    worktreeRootDigest: EVIDENCE_DIGEST,
    activationBindingDigest: ACTIVATION_DIGEST,
    sessionBindingDigest: EVIDENCE_DIGEST,
    executorSessionIdDigest: EVIDENCE_DIGEST,
    executorId: "codex",
    executorVersion: "1.0.0",
    executableDigest: EVIDENCE_DIGEST,
    hostSurface: "cli",
    modelId: "model-1",
    reasoningEffort: "high",
    permissionMode: "workspace-write",
    promptDigest: EVIDENCE_DIGEST,
    hookConfigDigest: EVIDENCE_DIGEST,
    startedAt: "2026-07-30T09:06:00.000Z",
    completedAt: "2026-07-30T09:07:00.000Z",
    durationMs: 60000,
    outcome: "completed",
    exitCode: 0,
    signal: null,
    timedOut: false,
    evidenceDigest: EVIDENCE_DIGEST,
  } as unknown as AgentSessionProcessEvidence;
  const snapshot = {
    repositoryId: REPOSITORY_ID,
    worktreeId: WORKTREE_ID,
    baseRevision: BASE_REVISION,
  };
  const checkpoint = {
    checkpoint: { targetRevision: TARGET_REVISION },
    bindingDigest: EVIDENCE_DIGEST,
  };
  const closeoutState = {
    schemaVersion: "coding-task-session.closeout-state.v3",
    workspaceId: WORKSPACE_ID,
    sessionId: SESSION_ID,
    codingTaskId: CODING_TASK_ID,
    sourceTaskId: "source-task-1",
    repositoryId: REPOSITORY_ID,
    attemptNumber: 1,
    activationBindingDigest: ACTIVATION_DIGEST,
    sessionBindingDigest: EVIDENCE_DIGEST,
    requestDigest: EVIDENCE_DIGEST,
    idempotencyKey: "closeout-1",
    commandId: "command-1",
    correlationId: "correlation-1",
    actor: { kind: "human", actorId: "human-1" },
    createdAt: "2026-07-30T09:04:00.000Z",
    status: CodingTaskSessionCloseoutStatus.CheckpointBound,
    snapshot,
    coverageManifest: null,
    coverageBindingDigest: null,
    checkpoint,
    stoppedStage: null,
    errorCode: null,
    recoveryGuidance: null,
    version: 1,
    updatedAt: "2026-07-30T09:08:00.000Z",
  } as unknown as CodingTaskSessionCloseoutState;
  const evidenceBundle = {
    schemaVersion: "verification.evidence-bundle.v1",
    verificationRunId: "verification-1",
    planId: "plan-1",
    repositoryId: REPOSITORY_ID,
    worktreeId: WORKTREE_ID,
    baseRevision: BASE_REVISION,
    targetRevision: TARGET_REVISION,
    planDigest: EVIDENCE_DIGEST,
    status: "passed",
    generatedAt: "2026-07-30T09:08:00.000Z",
    checks: [],
  } as unknown as EvidenceBundle;
  const evidenceBundleDigest = digest.calculate(evidenceBundle).value;
  const verificationActionJournal = {
    intent: {
      schemaVersion: ACTION_JOURNAL_SCHEMA_VERSION,
      recordType: ActionJournalRecordType.Intent,
      actionId: VERIFICATION_ACTION_ID,
      sequence: 1,
      workspaceId: WORKSPACE_ID,
      taskId: activation.sourceTaskId,
      commandId: "verification-command-1",
      correlationId: "verification-correlation-1",
      idempotencyKey: "verification-idempotency-1",
      kind: ActionKind.CommandExecution,
      target: "verification-plan-1",
      inputDigest: EVIDENCE_DIGEST,
      postconditionDigest: EVIDENCE_DIGEST,
      baseRevision: BASE_REVISION,
      recoveryGuidance: "读取验证证据后由 Human 决定是否接纳。",
      actor: { kind: "human", actorId: "human-1" },
      recordedAt: "2026-07-30T09:08:00.000Z",
    },
    observations: [
      {
        schemaVersion: ACTION_JOURNAL_SCHEMA_VERSION,
        recordType: ActionJournalRecordType.Observation,
        actionId: VERIFICATION_ACTION_ID,
        workspaceId: WORKSPACE_ID,
        taskId: activation.sourceTaskId,
        sequence: 2,
        outcome: ActionOutcome.Succeeded,
        evidenceIds: [],
        outputDigest: evidenceBundleDigest,
        actor: { kind: "human", actorId: "human-1" },
        recordedAt: "2026-07-30T09:08:00.000Z",
      },
    ],
    resolutions: [
      {
        schemaVersion: ACTION_JOURNAL_SCHEMA_VERSION,
        recordType: ActionJournalRecordType.Resolution,
        actionId: VERIFICATION_ACTION_ID,
        workspaceId: WORKSPACE_ID,
        taskId: activation.sourceTaskId,
        sequence: 3,
        resolution: ActionResolution.Committed,
        reason: "验证 EvidenceBundle 已持久化并通过摘要复验。",
        actor: { kind: "human", actorId: "human-1" },
        recordedAt: "2026-07-30T09:08:00.000Z",
      },
    ],
    lastSequence: 3,
    status: ActionJournalStatus.Committed,
  } as unknown as ActionJournalState;
  const dependencies: PilotMetricsApplicationDependencies = {
    pilotMetricsStore: store,
    activationRepository: {
      load: async () =>
        failure(new HarnessError(HarnessErrorCode.PreconditionNotMet, "activation missing")),
      create: async () => failure(new HarnessError(HarnessErrorCode.InvalidInput, "unused")),
    },
    processEvidenceStore: {
      load: async () => success(processEvidence),
      create: async () => failure(new HarnessError(HarnessErrorCode.InvalidInput, "unused")),
    },
    closeoutStateStore: {
      load: async () => success(closeoutState),
      find: async () => success(closeoutState),
      create: async () => failure(new HarnessError(HarnessErrorCode.InvalidInput, "unused")),
      replace: async () => failure(new HarnessError(HarnessErrorCode.InvalidInput, "unused")),
    },
    evidenceBundleStore: {
      load: async () => success(evidenceBundle),
      persist: async () => failure(new HarnessError(HarnessErrorCode.InvalidInput, "unused")),
    },
    actionJournalRepository: {
      load: async () => success(verificationActionJournal),
      createIntent: async () => failure(new HarnessError(HarnessErrorCode.InvalidInput, "unused")),
      appendObservation: async () =>
        failure(new HarnessError(HarnessErrorCode.InvalidInput, "unused")),
      appendResolution: async () =>
        failure(new HarnessError(HarnessErrorCode.InvalidInput, "unused")),
      listRecoverable: async () => success([]),
    },
    contentDigest: digest,
  };
  return {
    digest,
    store,
    activation,
    processEvidence,
    closeoutState,
    evidenceBundle,
    verificationActionJournal,
    dependencies,
  };
}

export function enrollmentDraft(overrides: Record<string, unknown> = {}) {
  return {
    pilotId: "pilot-1",
    ...pilotMetricsIds,
    taskClass: PilotTaskClass.Feature,
    riskLevel: PilotRiskLevel.Medium,
    historicalLogicChange: false,
    plannedWritePathCount: 1,
    requiredValidatorCount: 1,
    repositoryRevision: BASE_REVISION,
    harnessRevision: "harness-1",
    policyDigest: `${DIGEST_PREFIX}${"a".repeat(64)}`,
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
    actor: { kind: "human", actorId: "human-1" },
    ...overrides,
  };
}

export function settlementDraft(
  enrollment: PilotEnrollment,
  overrides: Record<string, unknown> = {},
) {
  return {
    pilotId: enrollment.pilotId,
    workspaceId: enrollment.workspaceId,
    sessionId: enrollment.sessionId,
    codingTaskId: enrollment.codingTaskId,
    repositoryId: enrollment.repositoryId,
    enrollmentDigest: enrollment.recordDigest,
    verificationRunId: "verification-1",
    verificationActionId: VERIFICATION_ACTION_ID,
    humanTouchEntries: [
      {
        entryId: "touch-1",
        category: PilotHumanTouchCategory.Review,
        source: PilotHumanTouchSource.Reported,
        startedAt: "2026-07-30T09:01:00.000Z",
        completedAt: "2026-07-30T09:02:00.000Z",
        durationMs: 60000,
      },
    ],
    stepFacts: enrollment.plannedSteps.map((step) => ({
      stepId: step.stepId,
      actualExecutionMode: step.expectedExecutionMode,
      outcome: PilotStepOutcome.Completed,
      attemptCount: 1,
      evidenceDigests: [],
    })),
    qualityFacts: [],
    attestation: PilotAttestation.Complete,
    settledAt: "2026-07-30T09:10:00.000Z",
    actor: { kind: "human", actorId: "human-1" },
    ...overrides,
  };
}

export function reportWith(
  fixture: PilotMetricsFixture,
  enrollment: PilotEnrollment,
  settlement: PilotSettlement,
): void {
  fixture.store.enrollment = enrollment;
  fixture.store.settlement = settlement;
}
