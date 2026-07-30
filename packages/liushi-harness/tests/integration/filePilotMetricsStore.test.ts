import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  ActorKind,
  PilotAttestation,
  PilotExecutionMode,
  PilotHumanTouchCategory,
  PilotHumanTouchSource,
  PilotMetricsCreateDisposition,
  PilotRiskLevel,
  PilotStepOutcome,
  PilotStepPhase,
  PilotTaskClass,
  ResultStatus,
  createPilotMetricsEnrollment,
  createPilotMetricsSettlement,
  rebuildPilotMetricsSettlement,
} from "../../src/index.js";
import {
  ExclusiveFileLockManager,
  FileParentDirectoryDurability,
  FilePilotMetricsStore,
  Rfc8785Sha256DigestAdapter,
  resolveFilePilotMetricsStorePaths,
} from "../../src/infrastructure/index.js";
import { HarnessErrorCode } from "../../src/common/index.js";
import { TemporaryRuntimeStore } from "../support/runtime/index.js";

const digest = new Rfc8785Sha256DigestAdapter();
const runtime = new TemporaryRuntimeStore();

function enrollmentDraft(): Record<string, unknown> {
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
    ],
    enrolledAt: "2026-07-30T09:00:00.000Z",
    actor: { kind: ActorKind.Human, actorId: "human-1" },
  };
}

function makeStore(root: string): FilePilotMetricsStore {
  return new FilePilotMetricsStore(root, {
    digest,
    lockManager: new ExclusiveFileLockManager(),
    parentDirectoryDurability: new FileParentDirectoryDurability(),
  });
}

describe("File Pilot Metrics Store", () => {
  afterEach(async () => runtime.cleanup());

  it("treats an absent Runtime Store root as no record for read-only queries", async () => {
    const parent = await runtime.create();
    const store = makeStore(resolve(parent, "absent-store"));
    const enrollment = createPilotMetricsEnrollment(enrollmentDraft(), digest);
    if (enrollment.status === ResultStatus.Failure) throw enrollment.error;
    const result = await store.findEnrollment({
      workspaceId: enrollment.value.workspaceId,
      sessionId: enrollment.value.sessionId,
    });

    expect(result).toEqual({ status: ResultStatus.Success, value: null });
  });

  it("uses the fixed path and supports create, reuse, conflict and find-missing", async () => {
    const root = await runtime.create();
    const store = makeStore(root);
    const enrollment = createPilotMetricsEnrollment(enrollmentDraft(), digest);
    if (enrollment.status === ResultStatus.Failure) throw enrollment.error;
    const first = await store.createEnrollment(enrollment.value);
    const reused = await store.createEnrollment(enrollment.value);
    const changed = createPilotMetricsEnrollment(
      { ...enrollmentDraft(), taskClass: PilotTaskClass.BugFix },
      digest,
    );
    if (changed.status === ResultStatus.Failure) throw changed.error;
    const conflict = await store.createEnrollment(changed.value);
    const found = await store.findEnrollment({
      workspaceId: enrollment.value.workspaceId,
      sessionId: enrollment.value.sessionId,
    });
    const missing = await store.findSettlement({
      workspaceId: enrollment.value.workspaceId,
      sessionId: enrollment.value.sessionId,
    });
    const paths = resolveFilePilotMetricsStorePaths(
      root,
      enrollment.value.workspaceId,
      enrollment.value.sessionId,
    );

    expect(first).toMatchObject({
      status: ResultStatus.Success,
      value: { disposition: PilotMetricsCreateDisposition.Created },
    });
    expect(reused).toMatchObject({
      status: ResultStatus.Success,
      value: { disposition: PilotMetricsCreateDisposition.Reused },
    });
    expect(conflict).toMatchObject({
      status: ResultStatus.Success,
      value: { disposition: PilotMetricsCreateDisposition.Conflict },
    });
    expect(found).toEqual({ status: ResultStatus.Success, value: enrollment.value });
    expect(missing).toEqual({ status: ResultStatus.Success, value: null });
    expect(paths.enrollmentFile).toBe(
      resolve(
        root,
        "workspaces",
        "workspace-1",
        "pilotMetrics",
        "sessions",
        "01J00000000000000000000000",
        "enrollment.json",
      ),
    );
    expect((await readFile(paths.enrollmentFile, "utf8")).endsWith("\n")).toBe(true);
  });

  it("rebuilds Settlement, rejects damaged files, invalid IDs and path escape", async () => {
    const root = await runtime.create();
    const store = makeStore(root);
    const enrollment = createPilotMetricsEnrollment(enrollmentDraft(), digest);
    if (enrollment.status === ResultStatus.Failure) throw enrollment.error;
    const settlement = createPilotMetricsSettlement(
      {
        pilotId: "pilot-1",
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
            completedAt: "2026-07-30T09:00:01.000Z",
            durationMs: 1000,
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
        qualityFacts: [],
        attestation: PilotAttestation.Complete,
        settledAt: "2026-07-30T09:00:01.000Z",
        actor: { kind: ActorKind.Human, actorId: "human-1" },
      },
      digest,
    );
    if (settlement.status === ResultStatus.Failure) throw settlement.error;
    const created = await store.createSettlement(settlement.value);
    expect(created).toMatchObject({
      status: ResultStatus.Success,
      value: { disposition: PilotMetricsCreateDisposition.Created },
    });
    expect(
      rebuildPilotMetricsSettlement({ ...settlement.value, schemaVersion: "unknown" }, digest)
        .status,
    ).toBe(ResultStatus.Failure);
    const paths = resolveFilePilotMetricsStorePaths(
      root,
      enrollment.value.workspaceId,
      enrollment.value.sessionId,
    );
    await writeFile(paths.settlementFile, "{}\n", "utf8");
    const damaged = await store.loadSettlement({
      workspaceId: enrollment.value.workspaceId,
      sessionId: enrollment.value.sessionId,
    });
    expect(damaged).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.CorruptStore },
    });

    const invalid = await store.findEnrollment({
      workspaceId: "../escape" as never,
      sessionId: enrollment.value.sessionId,
    });
    expect(invalid).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.InvalidInput },
    });

    const external = await runtime.create("pilot-metrics-external-");
    const escapedEnrollment = createPilotMetricsEnrollment(
      { ...enrollmentDraft(), workspaceId: "workspace-escape" },
      digest,
    );
    if (escapedEnrollment.status === ResultStatus.Failure) throw escapedEnrollment.error;
    const sessions = resolve(root, "workspaces", "workspace-escape", "pilotMetrics", "sessions");
    await mkdir(dirname(sessions), { recursive: true });
    await symlink(external, sessions, process.platform === "win32" ? "junction" : "dir");
    const escaped = await store.createEnrollment(escapedEnrollment.value);
    expect(escaped).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.OperationForbidden },
    });
  });

  it("maps parent directory durability failure to an outcome-unknown error", async () => {
    const root = await runtime.create();
    const store = new FilePilotMetricsStore(root, {
      digest,
      lockManager: new ExclusiveFileLockManager(),
      parentDirectoryDurability: {
        syncParentDirectory() {
          return Promise.reject(new Error("injected durability failure"));
        },
      },
    });
    const enrollment = createPilotMetricsEnrollment(enrollmentDraft(), digest);
    if (enrollment.status === ResultStatus.Failure) throw enrollment.error;

    const result = await store.createEnrollment(enrollment.value);

    expect(result).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.PilotMetricsCommitOutcomeUnknown },
    });
  });
});
