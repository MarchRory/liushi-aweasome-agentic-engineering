import { ArtifactType, type SupportedArtifact } from "#domain/artifact/index.js";
import { GateId } from "#domain/policy/index.js";
import { TaskPhase, TaskRunState, type TaskState } from "#domain/task/index.js";

import { TaskCheckpoint } from "../enums/index.js";

/** 将 Task 移入 Artifact 对应的 Human 等待阶段。 */
export function moveTaskToWaitingHuman(
  task: TaskState,
  artifact: SupportedArtifact,
  occurredAt: string,
): TaskState {
  return {
    ...task,
    phase:
      artifact.artifactType === ArtifactType.RequirementContract
        ? TaskPhase.Requirements
        : TaskPhase.Planning,
    runState: TaskRunState.WaitingHuman,
    updatedAt: occurredAt,
  };
}

/** 将无需 Human Gate 的低风险 PlanRisk 推进到实现阶段。 */
export function moveTaskAfterAllowedArtifact(
  task: TaskState,
  artifact: SupportedArtifact,
  occurredAt: string,
): TaskState {
  if (artifact.artifactType !== ArtifactType.PlanRisk) {
    throw new Error("Only low-risk PlanRisk may pass without a Human Gate.");
  }
  return {
    ...task,
    phase: TaskPhase.Implementation,
    runState: TaskRunState.Running,
    updatedAt: occurredAt,
  };
}

/** 根据已满足的 Human Gate 恢复 Task 执行。 */
export function resumeTaskAfterApproval(
  task: TaskState,
  gate: GateId,
  occurredAt: string,
): TaskState {
  return {
    ...task,
    phase: gate === GateId.G4RiskOperation ? TaskPhase.Implementation : TaskPhase.Planning,
    runState: TaskRunState.Running,
    updatedAt: occurredAt,
  };
}

/** 返回 WaitingHuman Artifact 对应的 Proposed Checkpoint。 */
export function proposedCheckpoint(artifact: SupportedArtifact): TaskCheckpoint {
  switch (artifact.artifactType) {
    case ArtifactType.RequirementContract:
      return TaskCheckpoint.RequirementProposed;
    case ArtifactType.BusinessLogicChangeContract:
      return TaskCheckpoint.BusinessLogicProposed;
    case ArtifactType.PlanRisk:
      return TaskCheckpoint.PlanProposed;
  }
}

/** 返回无需 Human Gate 的 Artifact 对应 Checkpoint。 */
export function allowedCheckpoint(artifact: SupportedArtifact): TaskCheckpoint {
  if (artifact.artifactType !== ArtifactType.PlanRisk) {
    throw new Error("Only PlanRisk has an approval-free checkpoint.");
  }
  return TaskCheckpoint.ImplementationReady;
}

/** 返回 Human Gate 满足后的 Approved Checkpoint。 */
export function approvedCheckpoint(gate: GateId): TaskCheckpoint {
  switch (gate) {
    case GateId.G1Requirement:
      return TaskCheckpoint.RequirementApproved;
    case GateId.G2BusinessLogic:
      return TaskCheckpoint.BusinessLogicApproved;
    case GateId.G4RiskOperation:
      return TaskCheckpoint.ImplementationReady;
  }
}
