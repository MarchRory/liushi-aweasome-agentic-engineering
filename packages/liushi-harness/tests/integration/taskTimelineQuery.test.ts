import { afterEach, describe, expect, it } from "vitest";

import {
  ApprovalDecision,
  HarnessErrorCode,
  ResultStatus,
  TaskEventType,
} from "../../src/index.js";
import {
  createWorkflowMigrationApplication,
  overwriteWorkflowMigrationEvents,
  readWorkflowMigrationEvents,
  removeWorkflowMigrationSnapshot,
  requirementProposal,
  workflowMigrationContext,
  workflowMigrationIds,
} from "../support/workflowMigration/index.js";
import { TemporaryRuntimeStore } from "../support/runtime/index.js";

const runtimeStores = new TemporaryRuntimeStore();

afterEach(async () => runtimeStores.cleanup());

describe("Task Timeline Query", () => {
  it("从 Event 重建最小 Tracker DTO，删除 Snapshot 后结果保持一致", async () => {
    const storeRoot = await runtimeStores.create("liushi-task-timeline-");
    const app = createWorkflowMigrationApplication(storeRoot);
    await createTask(app);
    const proposed = await app.proposeArtifact.execute({
      workspaceId: workflowMigrationContext.workspaceId,
      taskId: workflowMigrationIds.taskId,
      actor: workflowMigrationContext.actor,
      proposal: requirementProposal("Expose a stable tracker timeline."),
    });
    expect(proposed.status).toBe(ResultStatus.Success);
    if (proposed.status !== ResultStatus.Success || proposed.value.decisionRequest === undefined) {
      throw new Error("Timeline 测试必须创建 DecisionRequest。");
    }
    const approved = await app.recordApproval.execute({
      workspaceId: workflowMigrationContext.workspaceId,
      taskId: workflowMigrationIds.taskId,
      decisionRequestId: proposed.value.decisionRequest.decisionRequestId,
      decisionRequestDigest: proposed.value.decisionRequest.digest,
      idempotencyKey: "timeline-approval",
      actor: workflowMigrationContext.actor,
      decision: ApprovalDecision.Approved,
    });
    expect(approved.status).toBe(ResultStatus.Success);
    if (approved.status !== ResultStatus.Success) {
      throw approved.error;
    }

    const beforeReplay = await app.getTaskTimeline.execute({
      workspaceId: workflowMigrationContext.workspaceId,
      taskId: workflowMigrationIds.taskId,
    });
    expect(beforeReplay.status).toBe(ResultStatus.Success);
    if (beforeReplay.status !== ResultStatus.Success) {
      throw beforeReplay.error;
    }
    expect(beforeReplay.value.entries).toMatchObject([
      { sequence: 1, kind: "task_created", source: "ticket-workflow-migration" },
      {
        sequence: 2,
        kind: "artifact_committed",
        artifactType: "requirement_contract",
        revision: 1,
        gate: "G1",
        decisionRequestId: proposed.value.decisionRequest.decisionRequestId,
      },
      {
        sequence: 3,
        kind: "approval_recorded",
        approvalId: approved.value.approval.approvalId,
        decision: ApprovalDecision.Approved,
        gate: "G1",
      },
    ]);

    await removeWorkflowMigrationSnapshot(storeRoot);
    const afterReplay = await createWorkflowMigrationApplication(storeRoot).getTaskTimeline.execute(
      {
        workspaceId: workflowMigrationContext.workspaceId,
        taskId: workflowMigrationIds.taskId,
      },
    );

    expect(afterReplay).toEqual(beforeReplay);
  });

  it("Event 内容损坏时不返回 Timeline", async () => {
    const storeRoot = await runtimeStores.create("liushi-task-timeline-corrupt-");
    const app = createWorkflowMigrationApplication(storeRoot);
    await createTask(app);
    const events = await readWorkflowMigrationEvents(storeRoot);
    const first = events[0];
    if (first === undefined || first.type !== TaskEventType.TaskCreated) {
      throw new Error("Timeline 损坏测试必须存在首条 Event。");
    }
    await overwriteWorkflowMigrationEvents(storeRoot, [
      {
        ...first,
        payload: {
          ...first.payload,
          task: { ...first.payload.task, source: "tampered" },
        },
      },
    ]);

    const result = await app.getTaskTimeline.execute({
      workspaceId: workflowMigrationContext.workspaceId,
      taskId: workflowMigrationIds.taskId,
    });

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Failure) {
      expect(result.error.code).toBe(HarnessErrorCode.CorruptStore);
    }
  });
});

async function createTask(
  app: ReturnType<typeof createWorkflowMigrationApplication>,
): Promise<void> {
  const created = await app.createTask.execute({
    workspaceId: workflowMigrationContext.workspaceId,
    source: "ticket-workflow-migration",
    actor: workflowMigrationContext.actor,
  });
  expect(created.status).toBe(ResultStatus.Success);
}
