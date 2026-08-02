import type { TaskRepository } from "#application/ports/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import { ApprovalDecision } from "#domain/approval/index.js";
import {
  ArtifactType,
  type BusinessLogicChangeContractArtifact,
  type RequirementContractArtifact,
  type SupportedArtifact,
} from "#domain/artifact/index.js";
import { GateId } from "#domain/policy/index.js";
import { parseTaskId } from "#domain/task/index.js";
import { TaskCheckpoint, type TaskAggregate } from "#domain/taskRun/index.js";
import { parseWorkspaceId } from "#domain/workspace/index.js";

/** 已通过当前 Human Gate 的 Planning 上下文。 */
export interface ApprovedPlanningContext {
  /** G1 精确批准的 Requirement。 */
  readonly requirement: RequirementContractArtifact;
  /** G2 精确批准的 Business Logic；普通需求不存在。 */
  readonly businessLogic?: BusinessLogicChangeContractArtifact;
}

/** 从 Task Replay 读取可进入 PlanRisk 分析的权威上下文。 */
export async function loadApprovedPlanningContext(
  repository: TaskRepository,
  input: { readonly workspaceId: string; readonly taskId: string; readonly repositoryId: string },
): Promise<Result<ApprovedPlanningContext, HarnessError>> {
  const workspaceId = parseWorkspaceId(input.workspaceId);
  if (workspaceId.status === ResultStatus.Failure) return workspaceId;
  const taskId = parseTaskId(input.taskId);
  if (taskId.status === ResultStatus.Failure) return taskId;

  const loaded = await repository.load({ workspaceId: workspaceId.value, taskId: taskId.value });
  if (loaded.status === ResultStatus.Failure) return loaded;
  const aggregate = loaded.value.aggregate;
  if (
    aggregate.checkpoint !== TaskCheckpoint.RequirementApproved &&
    aggregate.checkpoint !== TaskCheckpoint.BusinessLogicApproved
  ) {
    return forbidden("Task 当前未处于可分析 PlanRisk 的检查点。", {
      checkpoint: aggregate.checkpoint,
    });
  }

  const requirement = findLatestArtifact(aggregate.artifacts, ArtifactType.RequirementContract);
  if (
    requirement === undefined ||
    !hasExactApproval(aggregate, requirement, GateId.G1Requirement)
  ) {
    return forbidden("PlanRisk 分析缺少精确 G1 批准的 Requirement。", {});
  }
  if (
    requirement.payload.repositories.length !== 1 ||
    requirement.payload.repositories[0] !== input.repositoryId
  ) {
    return forbidden("PlanRisk 分析的 Repository 与 Requirement 不一致。", {
      repositoryId: input.repositoryId,
    });
  }

  const businessLogic = findLatestArtifact(
    aggregate.artifacts,
    ArtifactType.BusinessLogicChangeContract,
  );
  if (aggregate.checkpoint === TaskCheckpoint.BusinessLogicApproved) {
    if (
      businessLogic === undefined ||
      !hasExactApproval(aggregate, businessLogic, GateId.G2BusinessLogic)
    ) {
      return forbidden("Task 声明 Business Logic 已批准，但缺少精确 G2 Approval。", {});
    }
    return success({ requirement, businessLogic });
  }
  if (businessLogic !== undefined) {
    return forbidden("Business Logic 尚未通过 G2，不能继续 PlanRisk 分析。", {});
  }
  return success({ requirement });
}

/** 查找已通过精确 G2 的 Business Logic，不限制 Task 后续检查点。 */
export async function loadApprovedBusinessLogic(
  repository: TaskRepository,
  input: { readonly workspaceId: string; readonly taskId: string },
): Promise<Result<BusinessLogicChangeContractArtifact, HarnessError>> {
  const workspaceId = parseWorkspaceId(input.workspaceId);
  if (workspaceId.status === ResultStatus.Failure) return workspaceId;
  const taskId = parseTaskId(input.taskId);
  if (taskId.status === ResultStatus.Failure) return taskId;
  const loaded = await repository.load({ workspaceId: workspaceId.value, taskId: taskId.value });
  if (loaded.status === ResultStatus.Failure) return loaded;
  const artifact = findLatestArtifact(
    loaded.value.aggregate.artifacts,
    ArtifactType.BusinessLogicChangeContract,
  );
  return artifact !== undefined &&
    hasExactApproval(loaded.value.aggregate, artifact, GateId.G2BusinessLogic)
    ? success(artifact)
    : forbidden("历史逻辑 PlanRisk 缺少精确 G2 批准的 Business Logic。", {});
}

function findLatestArtifact<T extends ArtifactType>(
  artifacts: readonly SupportedArtifact[],
  artifactType: T,
): Extract<SupportedArtifact, { artifactType: T }> | undefined {
  return [...artifacts]
    .reverse()
    .find(
      (artifact): artifact is Extract<SupportedArtifact, { artifactType: T }> =>
        artifact.artifactType === artifactType,
    );
}

function hasExactApproval(
  aggregate: TaskAggregate,
  artifact: SupportedArtifact,
  gate: GateId,
): boolean {
  return aggregate.approvals.some(
    (approval) =>
      approval.gate === gate &&
      approval.decision === ApprovalDecision.Approved &&
      approval.artifactId === artifact.artifactId &&
      approval.artifactDigest === artifact.digest,
  );
}

function forbidden(
  message: string,
  details: Readonly<Record<string, string>>,
): Result<never, HarnessError> {
  return failure(new HarnessError(HarnessErrorCode.OperationForbidden, message, details));
}
