import { afterEach, describe, expect, it } from "vitest";

import {
  ApprovalDecision,
  ArtifactStatus,
  CompileProjectProfileUseCase,
  HarnessErrorCode,
  ResultStatus,
  TaskPhase,
  TaskRunState,
  parseApprovalId,
  parseDecisionRequestId,
  type ApprovalRecord,
  type ProjectProfileProposalArtifact,
  type TaskAggregateRecord,
  type TaskRepository,
} from "../../src/index.js";
import {
  ACTOR,
  CREATED_AT,
  TASK_ID,
  WORKSPACE_ID,
  approvalInput,
  createProposedProfile,
  createRepositoryRevisionDriftReport,
  createTamperedReport,
  digestPort,
  makeRepository,
  makeUseCase,
  requirementProposal,
  runtimeStores,
  unwrap,
  withDigest,
} from "../support/profileCompile/index.js";

afterEach(async () => runtimeStores.cleanup());

describe("CompileProjectProfileUseCase", () => {
  it("compiles after exact approved G8 approval from FileTaskRepository", async () => {
    const setup = await createProposedProfile();
    const approved = await setup.app.recordApproval.execute(
      approvalInput(setup.decisionRequest, "approve-profile", ApprovalDecision.Approved),
    );
    expect(approved.status).toBe(ResultStatus.Success);

    const result = await makeUseCase(setup.storeRoot).execute({
      workspaceId: WORKSPACE_ID,
      taskId: TASK_ID,
      artifactId: setup.artifactId,
      report: setup.report,
    });

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Success) {
      expect(result.value.provenance).toMatchObject({
        approvalId: "01ARZ3NDEKTSV4RRFFQ69G5FD0",
        revision: 1,
      });
      expect(result.value.profiles[0]?.confirmedRole).toBe("application");
    }
  });

  it("fails closed when exact approved G8 approval is missing", async () => {
    const setup = await createProposedProfile();

    const result = await makeUseCase(setup.storeRoot).execute({
      workspaceId: WORKSPACE_ID,
      taskId: TASK_ID,
      artifactId: setup.artifactId,
      report: setup.report,
    });

    expectOperationForbidden(result);
  });

  it("fails closed when G8 approval is rejected", async () => {
    const setup = await createProposedProfile();
    const rejected = await setup.app.recordApproval.execute({
      ...approvalInput(setup.decisionRequest, "reject-profile", ApprovalDecision.Rejected),
      reason: "profile needs more evidence",
    });
    expect(rejected.status).toBe(ResultStatus.Success);

    const result = await makeUseCase(setup.storeRoot).execute({
      workspaceId: WORKSPACE_ID,
      taskId: TASK_ID,
      artifactId: setup.artifactId,
      report: setup.report,
    });

    expectOperationForbidden(result);
  });

  it("fails closed for wrong artifactId", async () => {
    const setup = await createProposedProfile();
    const approved = await setup.app.recordApproval.execute(
      approvalInput(setup.decisionRequest, "approve-profile", ApprovalDecision.Approved),
    );
    expect(approved.status).toBe(ResultStatus.Success);

    const result = await makeUseCase(setup.storeRoot).execute({
      workspaceId: WORKSPACE_ID,
      taskId: TASK_ID,
      artifactId: "01ARZ3NDEKTSV4RRFFQ69G5FB9",
      report: setup.report,
    });

    expectOperationForbidden(result);
  });

  it("fails closed for non-profile artifactId", async () => {
    const setup = await createProposedProfile();
    const approved = await setup.app.recordApproval.execute(
      approvalInput(setup.decisionRequest, "approve-profile", ApprovalDecision.Approved),
    );
    expect(approved.status).toBe(ResultStatus.Success);
    const requirement = await setup.app.proposeArtifact.execute({
      workspaceId: WORKSPACE_ID,
      taskId: TASK_ID,
      actor: ACTOR,
      proposal: requirementProposal(),
    });
    expect(requirement.status).toBe(ResultStatus.Success);
    if (requirement.status !== ResultStatus.Success) {
      throw new Error("Requirement fixture must be proposed.");
    }

    const result = await makeUseCase(setup.storeRoot).execute({
      workspaceId: WORKSPACE_ID,
      taskId: TASK_ID,
      artifactId: requirement.value.artifact.artifactId,
      report: setup.report,
    });

    expectOperationForbidden(result);
  });

  it("fails closed when revision2 rejected must not reuse revision1 approval", async () => {
    const setup = await createProposedProfile();
    const approved = await setup.app.recordApproval.execute(
      approvalInput(setup.decisionRequest, "approve-profile", ApprovalDecision.Approved),
    );
    expect(approved.status).toBe(ResultStatus.Success);

    const loaded = await makeRepository(setup.storeRoot).load({
      workspaceId: setup.artifact.workspaceId,
      taskId: setup.artifact.taskId,
    });
    expect(loaded.status).toBe(ResultStatus.Success);
    if (loaded.status !== ResultStatus.Success) {
      throw new Error("Approved profile aggregate fixture must load.");
    }
    const latestRejected = createRejectedRevisionRecord(loaded.value, setup.artifact);
    const result = await new CompileProjectProfileUseCase(
      new ReadOnlyTaskRepository(latestRejected),
      digestPort,
    ).execute({
      workspaceId: WORKSPACE_ID,
      taskId: TASK_ID,
      artifactId: setup.artifactId,
      report: setup.report,
    });

    expectOperationForbidden(result);
  });

  it("fails when current report digest is tampered", async () => {
    const setup = await createProposedProfile();
    const approved = await setup.app.recordApproval.execute(
      approvalInput(setup.decisionRequest, "approve-profile", ApprovalDecision.Approved),
    );
    expect(approved.status).toBe(ResultStatus.Success);

    const result = await makeUseCase(setup.storeRoot).execute({
      workspaceId: WORKSPACE_ID,
      taskId: TASK_ID,
      artifactId: setup.artifactId,
      report: createTamperedReport(setup.report),
    });

    expect(result.status).toBe(ResultStatus.Failure);
  });

  it("fails when repository revision drifts", async () => {
    const setup = await createProposedProfile();
    const approved = await setup.app.recordApproval.execute(
      approvalInput(setup.decisionRequest, "approve-profile", ApprovalDecision.Approved),
    );
    expect(approved.status).toBe(ResultStatus.Success);

    const result = await makeUseCase(setup.storeRoot).execute({
      workspaceId: WORKSPACE_ID,
      taskId: TASK_ID,
      artifactId: setup.artifactId,
      report: createRepositoryRevisionDriftReport(setup.report),
    });

    expect(result.status).toBe(ResultStatus.Failure);
  });
});

function expectOperationForbidden(
  result: Awaited<ReturnType<CompileProjectProfileUseCase["execute"]>>,
): void {
  expect(result.status).toBe(ResultStatus.Failure);
  if (result.status === ResultStatus.Failure) {
    expect(result.error.code).toBe(HarnessErrorCode.OperationForbidden);
  }
}

function createRejectedRevisionRecord(
  record: TaskAggregateRecord,
  approvedArtifact: ProjectProfileProposalArtifact,
): TaskAggregateRecord {
  const rejectedArtifact = withDigest(
    {
      ...approvedArtifact,
      revision: 2,
      parentDigest: approvedArtifact.digest,
      status: ArtifactStatus.Proposed,
      payload: {
        ...approvedArtifact.payload,
        workspaceGraphRevision: "graph-rev-2",
      },
    },
    undefined,
  );
  const approvedRecord = record.aggregate.approvals[0];
  if (approvedRecord === undefined) {
    throw new Error("Approved profile approval fixture is missing.");
  }
  const rejectedRecord: ApprovalRecord = {
    ...approvedRecord,
    approvalId: unwrap(parseApprovalId("01ARZ3NDEKTSV4RRFFQ69G5FD1")),
    decisionRequestId: unwrap(parseDecisionRequestId("01ARZ3NDEKTSV4RRFFQ69G5FC1")),
    artifactDigest: rejectedArtifact.digest,
    decision: ApprovalDecision.Rejected,
    idempotencyKey: "reject-revision-2",
    reason: "revision 2 rejected",
  };
  return {
    ...record,
    aggregate: {
      ...record.aggregate,
      task: {
        ...record.aggregate.task,
        phase: TaskPhase.Planning,
        runState: TaskRunState.WaitingHuman,
        updatedAt: CREATED_AT,
      },
      artifacts: [...record.aggregate.artifacts, rejectedArtifact],
      approvals: [...record.aggregate.approvals, rejectedRecord],
    },
  };
}

class ReadOnlyTaskRepository implements TaskRepository {
  public constructor(private readonly record: TaskAggregateRecord) {}

  public load(): Promise<{ status: ResultStatus.Success; value: TaskAggregateRecord }> {
    return Promise.resolve({ status: ResultStatus.Success, value: this.record });
  }

  public create(): Promise<never> {
    return Promise.reject(new Error("ReadOnlyTaskRepository does not support create."));
  }

  public get(): Promise<never> {
    return Promise.reject(new Error("ReadOnlyTaskRepository does not support get."));
  }

  public append(): Promise<never> {
    return Promise.reject(new Error("ReadOnlyTaskRepository does not support append."));
  }
}
