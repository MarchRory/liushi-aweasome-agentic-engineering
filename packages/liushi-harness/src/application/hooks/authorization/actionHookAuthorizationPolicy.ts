import { minimatch } from "minimatch";

import type { TaskRepository } from "#application/ports/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import { ActionKind } from "#domain/actionJournal/index.js";
import { ApprovalDecision } from "#domain/approval/index.js";
import {
  ArtifactType,
  type PlanRiskArtifact,
  type SupportedArtifact,
} from "#domain/artifact/index.js";
import { GateId, RiskLevel } from "#domain/policy/index.js";

import type { PreActionHookPayload } from "../contracts/index.js";

/** PreAction 授权成功后的权威 PlanRisk。 */
export interface AuthorizedHookAction {
  /** 精确绑定的 PlanRisk Artifact。 */
  readonly planRisk: PlanRiskArtifact;
}

/** 从 Task Replay、PlanRisk 与 Human Approval 重算 PreAction 授权。 */
export class ActionHookAuthorizationPolicy {
  public constructor(private readonly taskRepository: TaskRepository) {}

  /** 只允许精确 Write Set 内的文件动作；风险与历史逻辑按 Gate fail closed。 */
  public async authorize(
    payload: PreActionHookPayload,
  ): Promise<Result<AuthorizedHookAction, HarnessError>> {
    const loaded = await this.taskRepository.load({
      workspaceId: payload.workspaceId,
      taskId: payload.taskId,
    });
    if (loaded.status === ResultStatus.Failure) return loaded;
    const aggregate = loaded.value.aggregate;
    const artifact = aggregate.artifacts.find(
      (candidate) => candidate.artifactId === payload.planRiskArtifactId,
    );
    if (
      artifact === undefined ||
      artifact.artifactType !== ArtifactType.PlanRisk ||
      artifact.digest !== payload.planRiskArtifactDigest
    ) {
      return denied("PreAction 未绑定当前 Task 中的精确 PlanRisk Artifact。");
    }
    if (payload.actionKind !== ActionKind.FileMutation) {
      return denied("当前 Hook 主路径只授权 File Mutation。");
    }
    if (!payload.targets.every((target) => isTargetAllowed(target, artifact.payload.writeSet))) {
      return denied("PreAction 目标超出 PlanRisk Write Set。");
    }
    if (artifact.payload.riskLevel === RiskLevel.R4) {
      return denied("R4 Action 是当前 Harness 的 Hard Invariant 禁止项。");
    }
    if (
      [RiskLevel.R2, RiskLevel.R3].includes(artifact.payload.riskLevel) &&
      !hasApproval(aggregate.approvals, GateId.G4RiskOperation, artifact)
    ) {
      return denied("R2/R3 Action 缺少绑定当前 PlanRisk Digest 的 G4 Human Approval。");
    }
    if (artifact.payload.historicalLogicChange) {
      const businessLogicDigest = artifact.payload.businessLogicArtifactDigest;
      const businessLogicArtifact = aggregate.artifacts.find(
        (candidate) =>
          candidate.artifactType === ArtifactType.BusinessLogicChangeContract &&
          candidate.digest === businessLogicDigest,
      );
      if (
        businessLogicArtifact === undefined ||
        !hasApproval(aggregate.approvals, GateId.G2BusinessLogic, businessLogicArtifact)
      ) {
        return denied("历史业务逻辑改动缺少绑定精确 Contract Digest 的 G2 Human Approval。");
      }
    }
    return success({ planRisk: artifact });
  }
}

function isTargetAllowed(target: string, writeSet: readonly string[]): boolean {
  const normalizedTarget = normalizePath(target);
  return writeSet.some((entry) => {
    const normalizedEntry = normalizePath(entry);
    return (
      normalizedTarget === normalizedEntry ||
      (!hasGlob(normalizedEntry) && normalizedTarget.startsWith(`${normalizedEntry}/`)) ||
      minimatch(normalizedTarget, normalizedEntry, { dot: true, nocase: false })
    );
  });
}

function normalizePath(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\.\//u, "").replace(/\/$/u, "");
}

function hasGlob(value: string): boolean {
  return /[*?{}[\]]/u.test(value);
}

function hasApproval(
  approvals: readonly {
    gate: GateId;
    artifactId: string;
    artifactDigest: string;
    decision: ApprovalDecision;
  }[],
  gate: GateId,
  artifact: SupportedArtifact,
): boolean {
  return approvals.some(
    (approval) =>
      approval.gate === gate &&
      approval.artifactId === artifact.artifactId &&
      approval.artifactDigest === artifact.digest &&
      approval.decision === ApprovalDecision.Approved,
  );
}

function denied(message: string): Result<never, HarnessError> {
  return failure(new HarnessError(HarnessErrorCode.OperationForbidden, message));
}
