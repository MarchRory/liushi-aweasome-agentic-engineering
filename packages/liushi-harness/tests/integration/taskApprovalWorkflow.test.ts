import { readFile, rm, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  ActorKind,
  ApprovalDecision,
  ApprovalRecordDisposition,
  ArtifactStatus,
  ArtifactType,
  GateEvaluationResult,
  GateId,
  HarnessErrorCode,
  PROJECT_PROFILE_PROPOSAL_SCHEMA_VERSION,
  RepositoryRole,
  ResultStatus,
  RiskLevel,
  TaskCheckpoint,
  TaskPhase,
  TaskRunEventType,
  TaskRunState,
  createHarnessApplication,
  type Delay,
  type TaskAggregateSnapshot,
  type TaskRunEventRecord,
} from "../../src/index.js";
import { calculateTaskRunEventHash } from "../../src/infrastructure/persistence/fileEventStore/eventLog/index.js";
import {
  FixedClock,
  FixedSequenceIdGenerator,
  TemporaryRuntimeStore,
} from "../support/runtime/index.js";

const TASK_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const WORKSPACE_ID = "workspace-a";
const CREATED_AT = "2026-07-11T00:00:00.000Z";
const ACTOR = { kind: ActorKind.Human, actorId: "tester" };
const TASK_IDS = [TASK_ID];
const EVENT_IDS = [
  "01ARZ3NDEKTSV4RRFFQ69G5FAW",
  "01ARZ3NDEKTSV4RRFFQ69G5FAX",
  "01ARZ3NDEKTSV4RRFFQ69G5FAY",
  "01ARZ3NDEKTSV4RRFFQ69G5FAZ",
  "01ARZ3NDEKTSV4RRFFQ69G5FE2",
];
const ARTIFACT_IDS = ["01ARZ3NDEKTSV4RRFFQ69G5FB0", "01ARZ3NDEKTSV4RRFFQ69G5FB1"];
const DECISION_REQUEST_IDS = ["01ARZ3NDEKTSV4RRFFQ69G5FC0", "01ARZ3NDEKTSV4RRFFQ69G5FC1"];
const APPROVAL_IDS = ["01ARZ3NDEKTSV4RRFFQ69G5FD0", "01ARZ3NDEKTSV4RRFFQ69G5FD1"];
const CONCURRENT_EVENT_ID_A = "01ARZ3NDEKTSV4RRFFQ69G5FE0";
const CONCURRENT_EVENT_ID_B = "01ARZ3NDEKTSV4RRFFQ69G5FE1";
const CONCURRENT_APPROVAL_ID_A = "01ARZ3NDEKTSV4RRFFQ69G5FF0";
const CONCURRENT_APPROVAL_ID_B = "01ARZ3NDEKTSV4RRFFQ69G5FF1";
const runtimeStores = new TemporaryRuntimeStore();

describe("ProjectProfile promotion persistence", () => {
  it("相同 Proposal 幂等键只提交一个 Event，并拒绝绑定不同内容", async () => {
    const storeRoot = await runtimeStores.create("liushi-profile-idempotency-");
    const app = makeApp(storeRoot);
    await createTask(app);
    const input = {
      workspaceId: WORKSPACE_ID,
      taskId: TASK_ID,
      actor: ACTOR,
      proposal: projectProfileProposal(),
      idempotencyKey: "profile-proposal-g8",
    };

    const first = await app.proposeArtifact.execute(input);
    const replayed = await app.proposeArtifact.execute(input);
    expect(first.status).toBe(ResultStatus.Success);
    expect(replayed.status).toBe(ResultStatus.Success);
    if (first.status !== ResultStatus.Success || replayed.status !== ResultStatus.Success) {
      throw new Error("Artifact Proposal 幂等重放必须成功。");
    }
    expect(replayed.value.artifact).toEqual(first.value.artifact);
    expect(replayed.value.decisionRequest).toEqual(first.value.decisionRequest);
    expect(replayed.value.persistence).toBeUndefined();
    expect(first.value.artifact.proposalIdempotencyKey).toBe("profile-proposal-g8");
    expect(await readEvents(storeRoot)).toHaveLength(2);

    const changedProposal = projectProfileProposal();
    changedProposal.payload.workspaceGraphRevision = "different-graph";
    const conflict = await app.proposeArtifact.execute({
      ...input,
      proposal: changedProposal,
    });
    expect(conflict.status).toBe(ResultStatus.Failure);
    if (conflict.status === ResultStatus.Failure) {
      expect(conflict.error.code).toBe(HarnessErrorCode.ActionConflict);
    }
    expect(await readEvents(storeRoot)).toHaveLength(2);
  });

  it("并发提交同一 Proposal 幂等键时复用唯一 Artifact", async () => {
    const storeRoot = await runtimeStores.create("liushi-profile-idempotency-concurrent-");
    const app = makeApp(storeRoot);
    await createTask(app);
    const input = {
      workspaceId: WORKSPACE_ID,
      taskId: TASK_ID,
      actor: ACTOR,
      proposal: projectProfileProposal(),
      idempotencyKey: "profile-proposal-concurrent",
    };

    const [left, right] = await Promise.all([
      app.proposeArtifact.execute(input),
      app.proposeArtifact.execute(input),
    ]);
    expect(
      left.status,
      left.status === ResultStatus.Failure ? JSON.stringify(left.error) : undefined,
    ).toBe(ResultStatus.Success);
    expect(
      right.status,
      right.status === ResultStatus.Failure ? JSON.stringify(right.error) : undefined,
    ).toBe(ResultStatus.Success);
    if (left.status !== ResultStatus.Success || right.status !== ResultStatus.Success) {
      throw new Error("并发 Artifact Proposal 必须收敛到同一结果。");
    }
    expect(right.value.artifact).toEqual(left.value.artifact);
    expect(right.value.decisionRequest).toEqual(left.value.decisionRequest);
    expect(await readEvents(storeRoot)).toHaveLength(2);
  });

  it("ProjectProfile propose -> G8 decision -> approval -> Requirement proposal supports persistence replay", async () => {
    const storeRoot = await runtimeStores.create("liushi-profile-promotion-");
    const app = makeApp(storeRoot);

    await createTask(app);
    const profile = await app.proposeArtifact.execute({
      workspaceId: WORKSPACE_ID,
      taskId: TASK_ID,
      actor: ACTOR,
      proposal: projectProfileProposal(),
    });

    expect(profile.status).toBe(ResultStatus.Success);
    if (profile.status !== ResultStatus.Success || profile.value.decisionRequest === undefined) {
      throw new Error("ProjectProfileProposal must create a G8 DecisionRequest.");
    }
    expect(profile.value.gateEvaluation).toMatchObject({
      result: GateEvaluationResult.WaitingHuman,
      requiredGates: [GateId.G8ProjectCompliance],
    });
    expect(profile.value.decisionRequest).toMatchObject({
      gate: GateId.G8ProjectCompliance,
      artifactId: profile.value.artifact.artifactId,
      artifactDigest: profile.value.artifact.digest,
    });
    expect(profile.value.task).toMatchObject({
      phase: TaskPhase.Planning,
      runState: TaskRunState.WaitingHuman,
    });
    expect((await readSnapshot(storeRoot)).aggregate).toMatchObject({
      checkpoint: TaskCheckpoint.ProjectProfileProposed,
      pendingDecision: {
        decisionRequestId: profile.value.decisionRequest.decisionRequestId,
        digest: profile.value.decisionRequest.digest,
      },
    });

    const profileApproval = await approveDecision(app, profile.value.decisionRequest, "approve-g8");
    expect(profileApproval.status).toBe(ResultStatus.Success);
    if (profileApproval.status === ResultStatus.Success) {
      expect(profileApproval.value.gateEvaluation).toMatchObject({
        result: GateEvaluationResult.Allow,
        requiredGates: [GateId.G8ProjectCompliance],
      });
      expect(profileApproval.value.task).toMatchObject({
        phase: TaskPhase.Planning,
        runState: TaskRunState.Running,
      });
    }
    const approvedProfileSnapshot = await readSnapshot(storeRoot);
    expect(approvedProfileSnapshot.aggregate.checkpoint).toBe(
      TaskCheckpoint.ProjectProfileApproved,
    );
    expect(approvedProfileSnapshot.aggregate.pendingDecision).toBeUndefined();

    await rm(snapshotFile(storeRoot));
    const replayedRequirement = await createHarnessApplication({
      storeRoot,
      clock: new FixedClock(CREATED_AT),
      eventIdGenerator: new FixedSequenceIdGenerator([EVENT_IDS[3]!]),
      artifactIdGenerator: new FixedSequenceIdGenerator([ARTIFACT_IDS[1]!]),
      decisionRequestIdGenerator: new FixedSequenceIdGenerator([DECISION_REQUEST_IDS[1]!]),
    }).proposeArtifact.execute({
      workspaceId: WORKSPACE_ID,
      taskId: TASK_ID,
      actor: ACTOR,
      proposal: requirementProposal(),
    });

    expect(replayedRequirement.status).toBe(ResultStatus.Success);
    if (
      replayedRequirement.status !== ResultStatus.Success ||
      replayedRequirement.value.decisionRequest === undefined
    ) {
      throw new Error("Requirement proposal after replay must create a G1 DecisionRequest.");
    }
    expect(replayedRequirement.value.gateEvaluation).toMatchObject({
      result: GateEvaluationResult.WaitingHuman,
      requiredGates: [GateId.G1Requirement],
    });
    expect(replayedRequirement.value.decisionRequest).toMatchObject({
      gate: GateId.G1Requirement,
      artifactId: replayedRequirement.value.artifact.artifactId,
      artifactDigest: replayedRequirement.value.artifact.digest,
      resumeCheckpoint: TaskCheckpoint.RequirementApproved,
    });
    expect(replayedRequirement.value.task).toMatchObject({
      phase: TaskPhase.Requirements,
      runState: TaskRunState.WaitingHuman,
    });
    expect((await readSnapshot(storeRoot)).aggregate).toMatchObject({
      checkpoint: TaskCheckpoint.RequirementProposed,
      pendingDecision: {
        decisionRequestId: replayedRequirement.value.decisionRequest.decisionRequestId,
        artifactDigest: replayedRequirement.value.artifact.digest,
      },
    });
    expect(await readEvents(storeRoot)).toHaveLength(4);
  });

  it("rejected ProjectProfile revision creates a fresh G8 request and can be approved", async () => {
    const storeRoot = await runtimeStores.create("liushi-profile-revision-");
    const app = makeApp(storeRoot);

    await createTask(app);
    const proposed = await app.proposeArtifact.execute({
      workspaceId: WORKSPACE_ID,
      taskId: TASK_ID,
      actor: ACTOR,
      proposal: projectProfileProposal(),
    });
    expect(proposed.status).toBe(ResultStatus.Success);
    if (proposed.status !== ResultStatus.Success || proposed.value.decisionRequest === undefined) {
      throw new Error("ProjectProfileProposal must create a G8 DecisionRequest.");
    }

    const rejected = await app.recordApproval.execute({
      ...approvalInput(proposed.value.decisionRequest, "reject-g8", ApprovalDecision.Rejected),
      reason: "profile selection needs revision",
    });
    expect(rejected.status).toBe(ResultStatus.Success);
    if (rejected.status === ResultStatus.Success) {
      expect(rejected.value.task).toMatchObject({
        phase: TaskPhase.Planning,
        runState: TaskRunState.WaitingHuman,
      });
    }
    const afterRejected = await readEvents(storeRoot);

    const staleApproval = await approveDecision(
      app,
      proposed.value.decisionRequest,
      "approve-rejected-g8",
    );
    expect(staleApproval.status).toBe(ResultStatus.Failure);
    if (staleApproval.status === ResultStatus.Failure) {
      expect(staleApproval.error.code).toBe(HarnessErrorCode.DecisionConflict);
    }
    expect(await readEvents(storeRoot)).toHaveLength(afterRejected.length);

    const revisionProposal = projectProfileProposal();
    revisionProposal.payload.workspaceGraphRevision = "graph-rev-2";
    const revised = await app.proposeArtifact.execute({
      workspaceId: WORKSPACE_ID,
      taskId: TASK_ID,
      actor: ACTOR,
      proposal: revisionProposal,
    });
    expect(revised.status).toBe(ResultStatus.Success);
    if (revised.status !== ResultStatus.Success || revised.value.decisionRequest === undefined) {
      throw new Error("Rejected ProjectProfile revision must create a new G8 DecisionRequest.");
    }
    expect(revised.value.artifact).toMatchObject({
      artifactId: proposed.value.artifact.artifactId,
      revision: 2,
      parentDigest: proposed.value.artifact.digest,
    });
    expect(revised.value.artifact.digest).not.toBe(proposed.value.artifact.digest);
    expect(revised.value.decisionRequest).toMatchObject({
      gate: GateId.G8ProjectCompliance,
      artifactId: revised.value.artifact.artifactId,
      artifactDigest: revised.value.artifact.digest,
      resumeCheckpoint: TaskCheckpoint.ProjectProfileApproved,
    });
    expect(revised.value.decisionRequest.decisionRequestId).not.toBe(
      proposed.value.decisionRequest.decisionRequestId,
    );

    const approved = await approveDecision(
      app,
      revised.value.decisionRequest,
      "approve-revised-g8",
    );
    expect(approved.status).toBe(ResultStatus.Success);
    if (approved.status === ResultStatus.Success) {
      expect(approved.value.task).toMatchObject({
        phase: TaskPhase.Planning,
        runState: TaskRunState.Running,
      });
      expect(approved.value.gateEvaluation.result).toBe(GateEvaluationResult.Allow);
    }
    const approvedRevisionSnapshot = await readSnapshot(storeRoot);
    expect(approvedRevisionSnapshot.aggregate.checkpoint).toBe(
      TaskCheckpoint.ProjectProfileApproved,
    );
    expect(approvedRevisionSnapshot.aggregate.pendingDecision).toBeUndefined();
    expect(await readEvents(storeRoot)).toHaveLength(afterRejected.length + 2);
  });
});

afterEach(async () => runtimeStores.cleanup());

describe("Task approval workflow 生产语义集成测试", () => {
  it("create -> Requirement proposal -> WaitingHuman -> exact G1 approval 后可重启和删除 snapshot replay", async () => {
    const storeRoot = await runtimeStores.create("liushi-approval-replay-");
    const app = makeApp(storeRoot);

    await createTask(app);
    const proposed = await proposeRequirement(app);
    expect(proposed.status).toBe(ResultStatus.Success);
    if (proposed.status !== ResultStatus.Success) {
      return;
    }
    expect(proposed.value.gateEvaluation.result).toBe(GateEvaluationResult.WaitingHuman);
    expect(proposed.value.decisionRequest).toMatchObject({
      gate: GateId.G1Requirement,
      artifactId: proposed.value.artifact.artifactId,
      artifactDigest: proposed.value.artifact.digest,
    });
    expect(proposed.value.task).toMatchObject({
      phase: TaskPhase.Requirements,
      runState: TaskRunState.WaitingHuman,
    });

    const decisionRequest = proposed.value.decisionRequest;
    if (decisionRequest === undefined) {
      throw new Error("Requirement proposal must create a DecisionRequest.");
    }
    const approved = await approveDecision(app, decisionRequest, "approve-g1");

    expect(approved.status).toBe(ResultStatus.Success);
    if (approved.status === ResultStatus.Success) {
      expect(approved.value.disposition).toBe(ApprovalRecordDisposition.Recorded);
      expect(approved.value.gateEvaluation.result).toBe(GateEvaluationResult.Allow);
      expect(approved.value.task).toMatchObject({
        phase: TaskPhase.Planning,
        runState: TaskRunState.Running,
      });
    }
    expect((await readSnapshot(storeRoot)).aggregate.checkpoint).toBe(
      TaskCheckpoint.RequirementApproved,
    );

    const restarted = createHarnessApplication({ storeRoot });
    const restartedStatus = await restarted.getTaskStatus.execute({
      workspaceId: WORKSPACE_ID,
      taskId: TASK_ID,
    });
    expect(restartedStatus.status).toBe(ResultStatus.Success);
    if (restartedStatus.status === ResultStatus.Success) {
      expect(restartedStatus.value.phase).toBe(TaskPhase.Planning);
      expect(restartedStatus.value.runState).toBe(TaskRunState.Running);
    }

    await rm(snapshotFile(storeRoot));
    const replayedStatus = await createHarnessApplication({ storeRoot }).getTaskStatus.execute({
      workspaceId: WORKSPACE_ID,
      taskId: TASK_ID,
    });
    expect(replayedStatus.status).toBe(ResultStatus.Success);
    if (replayedStatus.status === ResultStatus.Success) {
      expect(replayedStatus.value.phase).toBe(TaskPhase.Planning);
      expect(replayedStatus.value.runState).toBe(TaskRunState.Running);
    }
    await expect(stat(snapshotFile(storeRoot))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("stale DecisionRequest digest 被 decision_conflict 拒绝且不追加 event", async () => {
    const storeRoot = await runtimeStores.create("liushi-stale-decision-");
    const app = makeApp(storeRoot);
    const proposed = await createAndProposeRequirement(app);
    const before = await readEvents(storeRoot);

    const stale = await app.recordApproval.execute({
      ...approvalInput(proposed.decisionRequest, "stale-digest", ApprovalDecision.Approved),
      decisionRequestDigest:
        "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    });

    expect(stale.status).toBe(ResultStatus.Failure);
    if (stale.status === ResultStatus.Failure) {
      expect(stale.error.code).toBe(HarnessErrorCode.DecisionConflict);
    }
    expect(await readEvents(storeRoot)).toHaveLength(before.length);
  });

  it("同一幂等键相同 Approval 复用不追加 event，同键不同决策冲突", async () => {
    const storeRoot = await runtimeStores.create("liushi-idempotent-approval-");
    const app = makeApp(storeRoot);
    const proposed = await createAndProposeRequirement(app);
    const recorded = await approveDecision(app, proposed.decisionRequest, "same-key");
    expect(recorded.status).toBe(ResultStatus.Success);
    const afterRecorded = await readEvents(storeRoot);

    const reused = await approveDecision(app, proposed.decisionRequest, "same-key");
    const conflicting = await app.recordApproval.execute({
      ...approvalInput(proposed.decisionRequest, "same-key", ApprovalDecision.Rejected),
      reason: "same key changed decision",
    });

    expect(reused.status).toBe(ResultStatus.Success);
    if (reused.status === ResultStatus.Success) {
      expect(reused.value.disposition).toBe(ApprovalRecordDisposition.Reused);
      expect(reused.value.persistence).toBeUndefined();
      expect(reused.value.approval.approvalId).toBe(APPROVAL_IDS[0]);
    }
    expect(await readEvents(storeRoot)).toHaveLength(afterRecorded.length);
    expect(conflicting.status).toBe(ResultStatus.Failure);
    if (conflicting.status === ResultStatus.Failure) {
      expect(conflicting.error.code).toBe(HarnessErrorCode.DecisionConflict);
    }
    expect(await readEvents(storeRoot)).toHaveLength(afterRecorded.length);
  });

  it("并发相同 Approval 只提交一条 event，另一调用重载后幂等复用", async () => {
    const storeRoot = await runtimeStores.create("liushi-concurrent-idempotency-");
    const setupApp = makeApp(storeRoot);
    const proposed = await createAndProposeRequirement(setupApp);
    const appA = makeApprovalApp(storeRoot, CONCURRENT_EVENT_ID_A, CONCURRENT_APPROVAL_ID_A);
    const appB = makeApprovalApp(storeRoot, CONCURRENT_EVENT_ID_B, CONCURRENT_APPROVAL_ID_B);

    const [resultA, resultB] = await Promise.all([
      approveDecision(appA, proposed.decisionRequest, "concurrent-key"),
      approveDecision(appB, proposed.decisionRequest, "concurrent-key"),
    ]);

    if (resultA.status === ResultStatus.Failure || resultB.status === ResultStatus.Failure) {
      throw new Error(`Concurrent approval failed: ${JSON.stringify({ resultA, resultB })}`);
    }
    expect(resultA.status).toBe(ResultStatus.Success);
    expect(resultB.status).toBe(ResultStatus.Success);
    if (resultA.status === ResultStatus.Success && resultB.status === ResultStatus.Success) {
      expect([resultA.value.disposition, resultB.value.disposition].sort()).toEqual([
        ApprovalRecordDisposition.Recorded,
        ApprovalRecordDisposition.Reused,
      ]);
      expect(resultA.value.approval.digest).toBe(resultB.value.approval.digest);
    }
    expect(await readEvents(storeRoot)).toHaveLength(3);
  });

  it("Approval 在超过旧冲突窗口后仍能等待 Lock 释放并提交", async () => {
    const storeRoot = await runtimeStores.create("liushi-delayed-lock-release-");
    const setupApp = makeApp(storeRoot);
    const proposed = await createAndProposeRequirement(setupApp);
    await writeFile(lockFile(storeRoot), "held by delayed concurrent request\n", "utf8");
    const release = new Promise<void>((resolveRelease, rejectRelease) => {
      setTimeout(() => {
        rm(lockFile(storeRoot)).then(() => resolveRelease(), rejectRelease);
      }, 400);
    });

    const result = await approveDecision(
      makeApprovalApp(storeRoot, CONCURRENT_EVENT_ID_A, CONCURRENT_APPROVAL_ID_A),
      proposed.decisionRequest,
      "delayed-lock-key",
    );
    await release;

    expect(result.status).toBe(ResultStatus.Success);
    expect(await readEvents(storeRoot)).toHaveLength(3);
  });

  it("锁冲突补偿重载发现 CorruptStore 时立即透传完整性错误", async () => {
    const storeRoot = await runtimeStores.create("liushi-lock-then-corrupt-");
    const setupApp = makeApp(storeRoot);
    const proposed = await createAndProposeRequirement(setupApp);
    await writeFile(lockFile(storeRoot), "held by concurrent request\n", "utf8");
    const recoveryApp = createHarnessApplication({
      storeRoot,
      delay: new OneShotCallbackDelay(async () => {
        await rm(lockFile(storeRoot));
        const events = await readEvents(storeRoot);
        const artifactEvent = events[1];
        if (artifactEvent === undefined) {
          throw new Error("Artifact event fixture is missing.");
        }
        artifactEvent.hash = "0".repeat(64);
        await writeEvents(storeRoot, events);
      }),
    });

    const result = await recoveryApp.recordApproval.execute(
      approvalInput(proposed.decisionRequest, "corrupt-retry-key", ApprovalDecision.Approved),
    );

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Failure) {
      expect(result.error.code).toBe(HarnessErrorCode.CorruptStore);
    }
  });

  it("Rejected 关闭旧 Request，显式 Artifact Revision 创建新 Request 后可重新审批", async () => {
    const storeRoot = await runtimeStores.create("liushi-rejected-stays-pending-");
    const app = makeApp(storeRoot);
    const proposed = await createAndProposeRequirement(app);
    const rejected = await app.recordApproval.execute({
      ...approvalInput(proposed.decisionRequest, "reject-key", ApprovalDecision.Rejected),
      reason: "scope is not acceptable",
    });
    const afterRejected = await readEvents(storeRoot);

    expect(rejected.status).toBe(ResultStatus.Success);
    if (rejected.status === ResultStatus.Success) {
      expect(rejected.value.task).toMatchObject({
        phase: TaskPhase.Requirements,
        runState: TaskRunState.WaitingHuman,
      });
    }
    const approvedLater = await approveDecision(app, proposed.decisionRequest, "new-approve-key");
    expect(approvedLater.status).toBe(ResultStatus.Failure);
    if (approvedLater.status === ResultStatus.Failure) {
      expect(approvedLater.error.code).toBe(HarnessErrorCode.DecisionConflict);
    }
    expect(await readEvents(storeRoot)).toHaveLength(afterRejected.length);

    const revisionProposal = requirementProposal();
    revisionProposal.payload.problem = "Revised scope after Human rejection.";
    const revised = await app.proposeArtifact.execute({
      workspaceId: WORKSPACE_ID,
      taskId: TASK_ID,
      actor: ACTOR,
      proposal: revisionProposal,
    });
    expect(revised.status).toBe(ResultStatus.Success);
    if (revised.status !== ResultStatus.Success || revised.value.decisionRequest === undefined) {
      throw new Error("Rejected Requirement revision must create a new DecisionRequest.");
    }
    expect(revised.value.artifact).toMatchObject({
      artifactId: proposed.artifact.artifactId,
      revision: 2,
      parentDigest: proposed.artifact.digest,
    });
    expect(revised.value.artifact.digest).not.toBe(proposed.artifact.digest);
    expect(revised.value.decisionRequest.decisionRequestId).not.toBe(
      proposed.decisionRequest.decisionRequestId,
    );

    const revisionApproval = await approveDecision(
      app,
      revised.value.decisionRequest,
      "approve-revision-key",
    );
    expect(revisionApproval.status).toBe(ResultStatus.Success);
    if (revisionApproval.status === ResultStatus.Success) {
      expect(revisionApproval.value.task).toMatchObject({
        phase: TaskPhase.Planning,
        runState: TaskRunState.Running,
      });
    }
    expect(await readEvents(storeRoot)).toHaveLength(afterRejected.length + 2);
  });

  it("Waived 被 operation_forbidden 拒绝且不追加 event", async () => {
    const storeRoot = await runtimeStores.create("liushi-waived-forbidden-");
    const app = makeApp(storeRoot);
    const proposed = await createAndProposeRequirement(app);
    const before = await readEvents(storeRoot);

    const waived = await app.recordApproval.execute({
      ...approvalInput(proposed.decisionRequest, "waive-key", ApprovalDecision.Waived),
      reason: "cannot require this gate",
    });

    expect(waived.status).toBe(ResultStatus.Failure);
    if (waived.status === ResultStatus.Failure) {
      expect(waived.error.code).toBe(HarnessErrorCode.OperationForbidden);
    }
    expect(await readEvents(storeRoot)).toHaveLength(before.length);
  });

  it("R2 PlanRisk 必须经过 G4 Human Approval 才进入 Implementation", async () => {
    const storeRoot = await runtimeStores.create("liushi-r2-g4-approval-");
    const app = makeApp(storeRoot);
    const requirement = await createAndProposeRequirement(app);
    const requirementApproval = await approveDecision(
      app,
      requirement.decisionRequest,
      "approve-before-r2",
    );
    expect(requirementApproval.status).toBe(ResultStatus.Success);

    const proposedPlan = await app.proposeArtifact.execute({
      workspaceId: WORKSPACE_ID,
      taskId: TASK_ID,
      actor: ACTOR,
      proposal: planRiskProposal(RiskLevel.R2),
    });
    expect(proposedPlan.status).toBe(ResultStatus.Success);
    if (
      proposedPlan.status !== ResultStatus.Success ||
      proposedPlan.value.decisionRequest === undefined
    ) {
      throw new Error("R2 PlanRisk must create a G4 DecisionRequest.");
    }
    expect(proposedPlan.value.decisionRequest.gate).toBe(GateId.G4RiskOperation);
    expect(proposedPlan.value.decisionRequest.writeSetDigest).toMatch(/^sha256:/);
    expect(proposedPlan.value.task.runState).toBe(TaskRunState.WaitingHuman);

    const planApproval = await approveDecision(
      app,
      proposedPlan.value.decisionRequest,
      "approve-r2-plan",
    );
    expect(planApproval.status).toBe(ResultStatus.Success);
    if (planApproval.status === ResultStatus.Success) {
      expect(planApproval.value.task).toMatchObject({
        phase: TaskPhase.Implementation,
        runState: TaskRunState.Running,
      });
      expect(planApproval.value.gateEvaluation.result).toBe(GateEvaluationResult.Allow);
    }
  });

  it("R4 PlanRisk proposal 在 requirement 完成后被 operation_forbidden 且不追加 event", async () => {
    const storeRoot = await runtimeStores.create("liushi-r4-plan-forbidden-");
    const app = makeApp(storeRoot);
    const proposed = await createAndProposeRequirement(app);
    const approved = await approveDecision(app, proposed.decisionRequest, "approve-before-r4");
    expect(approved.status).toBe(ResultStatus.Success);
    const before = await readEvents(storeRoot);

    const r4Plan = await app.proposeArtifact.execute({
      workspaceId: WORKSPACE_ID,
      taskId: TASK_ID,
      actor: ACTOR,
      proposal: planRiskProposal(RiskLevel.R4),
    });

    expect(r4Plan.status).toBe(ResultStatus.Failure);
    if (r4Plan.status === ResultStatus.Failure) {
      expect(r4Plan.error.code).toBe(HarnessErrorCode.OperationForbidden);
    }
    expect(await readEvents(storeRoot)).toHaveLength(before.length);
  });

  it("篡改 Artifact payload 后重算 Event hash 仍返回 corrupt_store", async () => {
    const storeRoot = await runtimeStores.create("liushi-artifact-digest-corrupt-");
    const app = makeApp(storeRoot);
    await createAndProposeRequirement(app);
    const events = await readEvents(storeRoot);
    const artifactEvent = events[1];
    if (
      artifactEvent === undefined ||
      artifactEvent.type !== TaskRunEventType.ArtifactCommitted ||
      artifactEvent.payload.artifact.artifactType !== ArtifactType.RequirementContract
    ) {
      throw new Error("Second event must be a Requirement ArtifactCommitted event.");
    }
    artifactEvent.payload.artifact.payload.problem = "tampered requirement payload";
    const { hash: previousHash, ...hashInput } = artifactEvent;
    if (previousHash.length === 0) {
      throw new Error("Artifact event hash must not be empty.");
    }
    artifactEvent.hash = calculateTaskRunEventHash(hashInput);
    await writeEvents(storeRoot, events);
    await rm(snapshotFile(storeRoot));

    const status = await createHarnessApplication({ storeRoot }).getTaskStatus.execute({
      workspaceId: WORKSPACE_ID,
      taskId: TASK_ID,
    });

    expect(status.status).toBe(ResultStatus.Failure);
    if (status.status === ResultStatus.Failure) {
      expect(status.error.code).toBe(HarnessErrorCode.CorruptStore);
    }
  });
});

function makeApp(storeRoot: string) {
  return createHarnessApplication({
    storeRoot,
    clock: new FixedClock(CREATED_AT),
    taskIdGenerator: new FixedSequenceIdGenerator(TASK_IDS),
    eventIdGenerator: new FixedSequenceIdGenerator(EVENT_IDS),
    artifactIdGenerator: new FixedSequenceIdGenerator(ARTIFACT_IDS),
    decisionRequestIdGenerator: new FixedSequenceIdGenerator(DECISION_REQUEST_IDS),
    approvalIdGenerator: new FixedSequenceIdGenerator(APPROVAL_IDS),
  });
}

function makeApprovalApp(storeRoot: string, eventId: string, approvalId: string) {
  return createHarnessApplication({
    storeRoot,
    clock: new FixedClock(CREATED_AT),
    eventIdGenerator: new FixedSequenceIdGenerator([eventId]),
    approvalIdGenerator: new FixedSequenceIdGenerator([approvalId]),
  });
}

async function createTask(app: ReturnType<typeof makeApp>): Promise<void> {
  const result = await app.createTask.execute({
    workspaceId: WORKSPACE_ID,
    source: "ticket-123",
    actor: ACTOR,
  });
  expect(result.status).toBe(ResultStatus.Success);
}

async function proposeRequirement(app: ReturnType<typeof makeApp>) {
  return app.proposeArtifact.execute({
    workspaceId: WORKSPACE_ID,
    taskId: TASK_ID,
    actor: ACTOR,
    proposal: requirementProposal(),
  });
}

async function createAndProposeRequirement(app: ReturnType<typeof makeApp>) {
  await createTask(app);
  const proposed = await proposeRequirement(app);
  expect(proposed.status).toBe(ResultStatus.Success);
  if (proposed.status !== ResultStatus.Success || proposed.value.decisionRequest === undefined) {
    throw new Error("Requirement proposal must create a DecisionRequest.");
  }
  return { ...proposed.value, decisionRequest: proposed.value.decisionRequest };
}

function approveDecision(
  app: ReturnType<typeof makeApp>,
  decisionRequest: NonNullable<
    Awaited<ReturnType<typeof createAndProposeRequirement>>["decisionRequest"]
  >,
  idempotencyKey: string,
) {
  return app.recordApproval.execute(
    approvalInput(decisionRequest, idempotencyKey, ApprovalDecision.Approved),
  );
}

function approvalInput(
  decisionRequest: NonNullable<
    Awaited<ReturnType<typeof createAndProposeRequirement>>["decisionRequest"]
  >,
  idempotencyKey: string,
  decision: ApprovalDecision,
) {
  return {
    workspaceId: WORKSPACE_ID,
    taskId: TASK_ID,
    decisionRequestId: decisionRequest.decisionRequestId,
    decisionRequestDigest: decisionRequest.digest,
    idempotencyKey,
    actor: ACTOR,
    decision,
  };
}

function requirementProposal() {
  return {
    artifactType: ArtifactType.RequirementContract,
    status: ArtifactStatus.Proposed,
    payload: {
      problem: "Implement a human approval workflow.",
      goals: ["Persist approvals with exact digest binding."],
      nonGoals: ["Implement executor adapters."],
      observableBehaviors: ["G1 approval resumes the task."],
      acceptanceCriteria: ["Replay reconstructs the approved requirement state."],
      includedScopes: ["packages/liushi-harness"],
      forbiddenScopes: ["unrelated packages"],
      repositories: ["liushi-aweasome-agentic-engineering"],
      edgeCases: ["stale DecisionRequest digest"],
      compatibilityConstraints: ["append-only event log remains authoritative"],
      evidence: [],
      claims: [],
      unknowns: [],
      humanAnswers: [],
    },
  };
}

function planRiskProposal(riskLevel: RiskLevel) {
  return {
    artifactType: ArtifactType.PlanRisk,
    status: ArtifactStatus.Proposed,
    payload: {
      steps: [{ order: 1, action: "Attempt a risky operation." }],
      readSet: ["packages/liushi-harness/src"],
      writeSet: ["packages/liushi-harness/src"],
      risks: [{ description: "Irreversible change.", mitigation: "Do not execute it." }],
      riskLevel,
      historicalLogicChange: false,
      riskOperations: [{ target: "runtime-store", reason: "Mutates persistent state." }],
      testPlan: ["Run integration tests."],
      rollbackPlan: ["Restore from backup."],
      requiredGates: [],
    },
  };
}

function projectProfileProposal() {
  return {
    artifactType: ArtifactType.ProjectProfileProposal,
    status: ArtifactStatus.Proposed,
    payload: {
      schemaVersion: PROJECT_PROFILE_PROPOSAL_SCHEMA_VERSION,
      discoveryReportDigest:
        "sha256:1111111111111111111111111111111111111111111111111111111111111111",
      workspaceGraphRevision: "graph-rev-1",
      repositorySelections: [
        {
          repositoryId: "repo-a",
          repositoryRevision: "repo-rev-1",
          profileCandidateDigest:
            "sha256:2222222222222222222222222222222222222222222222222222222222222222",
          confirmedRole: RepositoryRole.Application,
          acceptedRuleIds: ["rule-a"],
          rejectedRuleIds: ["rule-b"],
          acceptedMechanismCandidateIds: ["mechanism-a"],
          rejectedMechanismCandidateIds: ["mechanism-b"],
          verificationChecks: [
            {
              checkId: "project.typecheck",
              kind: "typecheck",
              requirement: "required",
              command: {
                executable: "corepack",
                args: ["pnpm", "typecheck"],
                workingDirectory: "",
                allowedEnvironmentKeys: ["CI", "PATH"],
              },
              timeoutMs: 120000,
              retryable: false,
              selectionMode: "always",
              validatorIds: ["typescript.typecheck"],
            },
          ],
        },
      ],
    },
  };
}

function taskDirectory(storeRoot: string): string {
  return resolve(storeRoot, "workspaces", WORKSPACE_ID, "tasks", TASK_ID);
}

function eventsFile(storeRoot: string): string {
  return resolve(taskDirectory(storeRoot), "events.jsonl");
}

function snapshotFile(storeRoot: string): string {
  return resolve(taskDirectory(storeRoot), "snapshot.json");
}

function lockFile(storeRoot: string): string {
  return resolve(taskDirectory(storeRoot), ".task.lock");
}

async function readEvents(storeRoot: string): Promise<TaskRunEventRecord[]> {
  return (await readFile(eventsFile(storeRoot), "utf8"))
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as TaskRunEventRecord);
}

async function writeEvents(
  storeRoot: string,
  events: readonly TaskRunEventRecord[],
): Promise<void> {
  await writeFile(
    eventsFile(storeRoot),
    `${events.map((event) => JSON.stringify(event)).join("\n")}\n`,
    "utf8",
  );
}

async function readSnapshot(storeRoot: string): Promise<TaskAggregateSnapshot> {
  return JSON.parse(await readFile(snapshotFile(storeRoot), "utf8")) as TaskAggregateSnapshot;
}

/** 首次等待时执行故障注入回调，后续等待不再重复副作用。 */
class OneShotCallbackDelay implements Delay {
  private invoked = false;

  public constructor(private readonly callback: () => Promise<void>) {}

  public async wait(): Promise<void> {
    if (this.invoked) {
      return;
    }
    this.invoked = true;
    await this.callback();
  }
}
