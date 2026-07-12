import type { CodingTaskExecutionAuthorizationResolver } from "#application/ports/index.js";
import type { TaskRepository } from "#application/ports/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Clock,
  type Result,
} from "#common/index.js";
import {
  ArtifactType,
  type BusinessLogicChangeContractArtifact,
  type PlanRiskArtifact,
  type SupportedArtifact,
} from "#domain/artifact/index.js";
import { evaluateArtifactGate } from "#domain/gate/index.js";
import { GateEvaluationResult } from "#domain/policy/index.js";
import {
  normalizeWriteSet,
  type CodingTaskExecutionAuthorization,
  type CodingTaskGateBinding,
} from "#domain/codingTask/index.js";

import type { CodingTaskAuthorizationRequest } from "#application/ports/index.js";

/** 从 RequirementWorkflow Task Replay 重算 CodingTask 的执行授权。 */
export class TaskBackedCodingTaskAuthorizationPolicy implements CodingTaskExecutionAuthorizationResolver {
  public constructor(
    private readonly taskRepository: TaskRepository,
    private readonly clock: Clock,
  ) {}

  /** 只接受当前 Task 中已存在且已通过 Human Gate 的授权事实。 */
  public async resolve(
    request: CodingTaskAuthorizationRequest,
  ): Promise<Result<CodingTaskExecutionAuthorization, HarnessError>> {
    const loaded = await this.taskRepository.load({
      workspaceId: request.workspaceId,
      taskId: request.sourceTaskId,
    });
    if (loaded.status === ResultStatus.Failure) {
      return loaded.error.code === HarnessErrorCode.TaskNotFound
        ? forbidden("CodingTask 授权来源 Task 不存在或不可用。")
        : loaded;
    }
    if (loaded.value.aggregate.task.workspaceId !== request.workspaceId) {
      return forbidden("CodingTask 授权来源 Task 不属于当前 Workspace。");
    }

    const planRisk = findPlanRisk(
      loaded.value.aggregate.artifacts,
      request.requested.planRisk.artifactId,
      request.requested.planRisk.artifactDigest,
    );
    if (planRisk === undefined) {
      return forbidden("CodingTask 未绑定当前 Task 中的精确 PlanRisk Artifact。");
    }
    if (request.requested.historicalLogicChange !== planRisk.payload.historicalLogicChange) {
      return forbidden("CodingTask 的历史业务逻辑声明与 PlanRisk 不一致。");
    }
    if (!sameWriteSet(request.writeSet, planRisk.payload.writeSet)) {
      return forbidden("CodingTask Write Set 与已确认 PlanRisk Write Set 不一致。");
    }

    const evaluatedAt = this.clock.now().toISOString();
    const planRiskEvaluation = evaluateArtifactGate(
      planRisk,
      loaded.value.aggregate.approvals,
      evaluatedAt,
    );
    if (planRiskEvaluation.result !== GateEvaluationResult.Allow) {
      return forbidden("PlanRisk 尚未通过当前所需的 Human Gate。");
    }

    const authorization: CodingTaskExecutionAuthorization = {
      planRisk: toBinding(planRiskEvaluation),
      historicalLogicChange: planRisk.payload.historicalLogicChange,
    };
    if (!planRisk.payload.historicalLogicChange) {
      if (request.requested.businessLogic !== undefined) {
        return forbidden("未涉及历史业务逻辑时不能携带 Business Logic 授权。");
      }
      return success(authorization);
    }

    const businessLogic = findBusinessLogic(
      loaded.value.aggregate.artifacts,
      planRisk.payload.businessLogicArtifactDigest,
    );
    if (businessLogic === undefined || request.requested.businessLogic === undefined) {
      return forbidden("历史业务逻辑变更缺少精确的 Business Logic 授权。");
    }
    if (
      request.requested.businessLogic.artifactId !== businessLogic.artifactId ||
      request.requested.businessLogic.artifactDigest !== businessLogic.digest
    ) {
      return forbidden("Business Logic 授权未绑定当前 Task 的 Artifact Digest。");
    }
    const businessLogicEvaluation = evaluateArtifactGate(
      businessLogic,
      loaded.value.aggregate.approvals,
      evaluatedAt,
    );
    if (businessLogicEvaluation.result !== GateEvaluationResult.Allow) {
      return forbidden("历史业务逻辑变更尚未通过 G2 Human Gate。");
    }
    return success({
      ...authorization,
      businessLogic: toBinding(businessLogicEvaluation),
    });
  }
}

function findPlanRisk(
  artifacts: readonly SupportedArtifact[],
  artifactId: string,
  artifactDigest: string,
): PlanRiskArtifact | undefined {
  return artifacts.find(
    (artifact): artifact is PlanRiskArtifact =>
      artifact.artifactType === ArtifactType.PlanRisk &&
      artifact.artifactId === artifactId &&
      artifact.digest === artifactDigest,
  );
}

function findBusinessLogic(
  artifacts: readonly SupportedArtifact[],
  artifactDigest: string | undefined,
): BusinessLogicChangeContractArtifact | undefined {
  if (artifactDigest === undefined) return undefined;
  return artifacts.find(
    (artifact): artifact is BusinessLogicChangeContractArtifact =>
      artifact.artifactType === ArtifactType.BusinessLogicChangeContract &&
      artifact.digest === artifactDigest,
  );
}

function toBinding(evaluation: {
  artifactId: CodingTaskGateBinding["artifactId"];
  artifactDigest: CodingTaskGateBinding["artifactDigest"];
  result: CodingTaskGateBinding["result"];
  requiredGates: CodingTaskGateBinding["requiredGates"];
  satisfiedApprovals: CodingTaskGateBinding["satisfiedApprovalIds"];
}): CodingTaskGateBinding {
  return {
    artifactId: evaluation.artifactId,
    artifactDigest: evaluation.artifactDigest,
    result: evaluation.result,
    requiredGates: evaluation.requiredGates,
    satisfiedApprovalIds: evaluation.satisfiedApprovals,
  };
}

function sameWriteSet(left: readonly string[], right: readonly string[]): boolean {
  try {
    const normalizedLeft = normalizeWriteSet(left);
    const normalizedRight = normalizeWriteSet(right);
    return (
      normalizedLeft.length === normalizedRight.length &&
      normalizedLeft.every((path, index) => path === normalizedRight[index])
    );
  } catch {
    return false;
  }
}

function forbidden(message: string): Result<never, HarnessError> {
  return failure(new HarnessError(HarnessErrorCode.OperationForbidden, message));
}
