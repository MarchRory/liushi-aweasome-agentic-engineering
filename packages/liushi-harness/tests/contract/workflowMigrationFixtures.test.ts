import { afterEach, describe, expect, it } from "vitest";

import { ApprovalDecision, ResultStatus, createHarnessApplication } from "../../src/index.js";
import {
  approvedRequirementGoldenStream,
  createWorkflowMigrationLocator,
  createWorkflowMigrationApplication,
  createWorkflowMigrationRepository,
  eventTypes,
  readWorkflowMigrationEvents,
  rejectedRequirementRevisionGoldenStream,
  removeWorkflowMigrationSnapshot,
  requirementProposal,
  summarizeWorkflowMigrationAggregate,
  workflowMigrationContext,
  workflowMigrationIds,
} from "../support/workflowMigration/index.js";
import { TemporaryRuntimeStore } from "../support/runtime/index.js";

const runtimeStores = new TemporaryRuntimeStore();

afterEach(async () => runtimeStores.cleanup());

describe("liushi-harness V1 Golden Replay conformance", () => {
  it("freezes create -> Requirement artifact -> approval", async () => {
    const storeRoot = await runtimeStores.create("liushi-workflow-migration-approved-");
    const app = createWorkflowMigrationApplication(storeRoot);

    const created = await app.createTask.execute({
      workspaceId: workflowMigrationContext.workspaceId,
      source: "ticket-workflow-migration",
      actor: workflowMigrationContext.actor,
    });
    expect(created.status).toBe(ResultStatus.Success);
    if (created.status !== ResultStatus.Success) {
      throw new Error("Golden create stream must create a task.");
    }

    const proposed = await app.proposeArtifact.execute({
      workspaceId: workflowMigrationContext.workspaceId,
      taskId: workflowMigrationIds.taskId,
      actor: workflowMigrationContext.actor,
      proposal: requirementProposal("Freeze the V1 requirement replay contract."),
    });
    expect(proposed.status).toBe(ResultStatus.Success);
    if (proposed.status !== ResultStatus.Success || proposed.value.decisionRequest === undefined) {
      throw new Error("Golden requirement stream must create a DecisionRequest.");
    }

    const approved = await app.recordApproval.execute({
      workspaceId: workflowMigrationContext.workspaceId,
      taskId: workflowMigrationIds.taskId,
      decisionRequestId: proposed.value.decisionRequest.decisionRequestId,
      decisionRequestDigest: proposed.value.decisionRequest.digest,
      idempotencyKey: "workflow-migration-approve-v1",
      actor: workflowMigrationContext.actor,
      decision: ApprovalDecision.Approved,
    });
    expect(approved.status).toBe(ResultStatus.Success);
    if (approved.status !== ResultStatus.Success) {
      throw new Error("Golden approval stream must record an approval.");
    }

    const events = await readWorkflowMigrationEvents(storeRoot);
    const record = await loadRecord(storeRoot);
    expect(eventTypes(events)).toEqual(approvedRequirementGoldenStream.expectedEventTypes);
    expect(record.lastSequence).toBe(3);
    expect(record.aggregate.checkpoint).toBe(approvedRequirementGoldenStream.expectedCheckpoint);
    expect(record.aggregate.task).toMatchObject(approvedRequirementGoldenStream.expectedTask);
    expect(record.aggregate.artifacts).toHaveLength(1);
    expect(record.aggregate.artifacts[0]).toMatchObject({
      artifactType: "requirement_contract",
      revision: approvedRequirementGoldenStream.expectedArtifactRevision,
    });
    expect(record.aggregate.approvals[0]).toMatchObject({
      decision: approvedRequirementGoldenStream.expectedDecision,
      gate: approvedRequirementGoldenStream.expectedGate,
      artifactId: record.aggregate.artifacts[0]?.artifactId,
      artifactDigest: record.aggregate.artifacts[0]?.digest,
    });
    expect(record.aggregate.pendingDecision).toBeUndefined();
  });

  it("freezes reject -> new Requirement revision", async () => {
    const storeRoot = await runtimeStores.create("liushi-workflow-migration-revision-");
    const app = createWorkflowMigrationApplication(storeRoot);

    await createTask(app);
    const firstProposal = await proposeRequirement(app, "Freeze the rejected V1 revision.");
    expect(firstProposal.status).toBe(ResultStatus.Success);
    if (
      firstProposal.status !== ResultStatus.Success ||
      firstProposal.value.decisionRequest === undefined
    ) {
      throw new Error("Golden revision stream must create the first DecisionRequest.");
    }

    const rejected = await app.recordApproval.execute({
      workspaceId: workflowMigrationContext.workspaceId,
      taskId: workflowMigrationIds.taskId,
      decisionRequestId: firstProposal.value.decisionRequest.decisionRequestId,
      decisionRequestDigest: firstProposal.value.decisionRequest.digest,
      idempotencyKey: "workflow-migration-reject-v1",
      actor: workflowMigrationContext.actor,
      decision: ApprovalDecision.Rejected,
      reason: "The requirement needs a narrower scope.",
    });
    expect(rejected.status).toBe(ResultStatus.Success);

    const revisionProposal = await proposeRequirement(
      app,
      "Freeze the narrowed V1 requirement replay contract.",
    );
    expect(revisionProposal.status).toBe(ResultStatus.Success);
    if (
      revisionProposal.status !== ResultStatus.Success ||
      revisionProposal.value.decisionRequest === undefined
    ) {
      throw new Error("Golden revision stream must create the second DecisionRequest.");
    }

    const events = await readWorkflowMigrationEvents(storeRoot);
    const record = await loadRecord(storeRoot);
    const firstArtifact = record.aggregate.artifacts[0];
    const secondArtifact = record.aggregate.artifacts[1];
    expect(eventTypes(events)).toEqual(rejectedRequirementRevisionGoldenStream.expectedEventTypes);
    expect(record.lastSequence).toBe(4);
    expect(record.aggregate.checkpoint).toBe(
      rejectedRequirementRevisionGoldenStream.expectedCheckpoint,
    );
    expect(record.aggregate.task).toMatchObject(
      rejectedRequirementRevisionGoldenStream.expectedTask,
    );
    expect(record.aggregate.artifacts.map((artifact) => artifact.revision)).toEqual(
      rejectedRequirementRevisionGoldenStream.expectedArtifactRevisions,
    );
    expect(secondArtifact).toMatchObject({
      artifactId: firstArtifact?.artifactId,
      parentDigest: firstArtifact?.digest,
      revision: 2,
    });
    expect(record.aggregate.approvals[0]).toMatchObject({
      decision: rejectedRequirementRevisionGoldenStream.expectedDecision,
      gate: rejectedRequirementRevisionGoldenStream.expectedGate,
      artifactId: firstArtifact?.artifactId,
      artifactDigest: firstArtifact?.digest,
    });
    expect(record.aggregate.pendingDecision).toMatchObject({
      gate: rejectedRequirementRevisionGoldenStream.expectedGate,
      artifactId: secondArtifact?.artifactId,
      artifactDigest: secondArtifact?.digest,
    });
    expect(revisionProposal.value.decisionRequest.decisionRequestId).not.toBe(
      firstProposal.value.decisionRequest.decisionRequestId,
    );
  });

  it("replay preserves the V1 semantic summary", async () => {
    const storeRoot = await runtimeStores.create("liushi-workflow-migration-replay-");
    const app = createWorkflowMigrationApplication(storeRoot);

    await createTask(app);
    const proposed = await proposeRequirement(app, "Freeze replay semantic equality.");
    expect(proposed.status).toBe(ResultStatus.Success);
    if (proposed.status !== ResultStatus.Success || proposed.value.decisionRequest === undefined) {
      throw new Error("Replay stream must create a DecisionRequest.");
    }
    const approved = await app.recordApproval.execute({
      workspaceId: workflowMigrationContext.workspaceId,
      taskId: workflowMigrationIds.taskId,
      decisionRequestId: proposed.value.decisionRequest.decisionRequestId,
      decisionRequestDigest: proposed.value.decisionRequest.digest,
      idempotencyKey: "workflow-migration-replay-approve-v1",
      actor: workflowMigrationContext.actor,
      decision: ApprovalDecision.Approved,
    });
    expect(approved.status).toBe(ResultStatus.Success);

    const repository = createWorkflowMigrationRepository(storeRoot);
    const beforeReplay = await repository.load(createWorkflowMigrationLocator());
    expect(beforeReplay.status).toBe(ResultStatus.Success);
    if (beforeReplay.status !== ResultStatus.Success) {
      throw new Error("Replay stream must load before removing the snapshot.");
    }
    const expectedSummary = summarizeWorkflowMigrationAggregate(beforeReplay.value);

    await removeWorkflowMigrationSnapshot(storeRoot);
    const afterReplay = await createHarnessApplication({ storeRoot }).getTaskStatus.execute({
      workspaceId: workflowMigrationContext.workspaceId,
      taskId: workflowMigrationIds.taskId,
    });
    const replayedRecord = await repository.load(createWorkflowMigrationLocator());

    expect(afterReplay.status).toBe(ResultStatus.Success);
    expect(replayedRecord.status).toBe(ResultStatus.Success);
    if (afterReplay.status === ResultStatus.Success) {
      expect(afterReplay.value).toEqual(beforeReplay.value.aggregate.task);
    }
    if (replayedRecord.status === ResultStatus.Success) {
      expect(summarizeWorkflowMigrationAggregate(replayedRecord.value)).toEqual(expectedSummary);
    }
  });
});

async function createTask(
  app: ReturnType<typeof createWorkflowMigrationApplication>,
): Promise<void> {
  const result = await app.createTask.execute({
    workspaceId: workflowMigrationContext.workspaceId,
    source: "ticket-workflow-migration",
    actor: workflowMigrationContext.actor,
  });
  expect(result.status).toBe(ResultStatus.Success);
}

function proposeRequirement(
  app: ReturnType<typeof createWorkflowMigrationApplication>,
  problem: string,
) {
  return app.proposeArtifact.execute({
    workspaceId: workflowMigrationContext.workspaceId,
    taskId: workflowMigrationIds.taskId,
    actor: workflowMigrationContext.actor,
    proposal: requirementProposal(problem),
  });
}

async function loadRecord(storeRoot: string) {
  const result = await createWorkflowMigrationRepository(storeRoot).load(
    createWorkflowMigrationLocator(),
  );
  expect(result.status).toBe(ResultStatus.Success);
  if (result.status !== ResultStatus.Success) {
    throw new Error("Golden stream must load its aggregate.");
  }
  return result.value;
}
