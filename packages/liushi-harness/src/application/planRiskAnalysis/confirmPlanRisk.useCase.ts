import type { ArtifactDigestPort, TaskRepository } from "#application/ports/index.js";
import type { ProposeArtifactUseCase, RecordApprovalUseCase } from "#application/useCases/index.js";
import {
  ActorKind,
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  validateActorRef,
  type Result,
} from "#common/index.js";
import { ApprovalDecision } from "#domain/approval/index.js";
import {
  ArtifactType,
  type BusinessLogicChangeContractProposal,
  type PlanRiskProposal,
} from "#domain/artifact/index.js";
import { GateEvaluationResult, GateId } from "#domain/policy/index.js";

import {
  BUSINESS_LOGIC_APPROVAL_IDEMPOTENCY_PREFIX,
  BUSINESS_LOGIC_PROPOSAL_IDEMPOTENCY_PREFIX,
  PLAN_RISK_APPROVAL_IDEMPOTENCY_PREFIX,
  PLAN_RISK_CONFIRMATION_SCHEMA_VERSION,
  PLAN_RISK_PROPOSAL_IDEMPOTENCY_PREFIX,
} from "./planRiskAnalysis.constants.js";
import type {
  ConfirmBusinessLogicOutput,
  ConfirmPlanRiskInput,
  ConfirmPlanRiskOutput,
  ConfirmPlanRiskReviewOutput,
} from "./planRiskAnalysis.contracts.js";
import {
  PlanRiskConfirmationStatus,
  PlanRiskNextStep,
  PlanRiskReviewKind,
} from "./planRiskAnalysis.enums.js";
import { parseConfirmedPlanningReview } from "./confirmPlanRiskValidation.js";
import { loadApprovedBusinessLogic } from "./planningContext.js";

/** Human Review 后复用 Artifact/Gate Core 完成 Business Logic 或 PlanRisk 确认。 */
export class ConfirmPlanRiskUseCase {
  public constructor(
    private readonly repository: TaskRepository,
    private readonly proposeArtifact: Pick<ProposeArtifactUseCase, "execute">,
    private readonly recordApproval: Pick<RecordApprovalUseCase, "execute">,
    private readonly digestPort: ArtifactDigestPort,
  ) {}

  /** 校验 Human 语义修改，并在内部绑定 Artifact Digest 与所需 Approval。 */
  public async execute(
    input: ConfirmPlanRiskInput,
  ): Promise<Result<ConfirmPlanRiskOutput, HarnessError>> {
    const actor = validateActorRef(input.actor);
    if (actor.status === ResultStatus.Failure) return actor;
    if (actor.value.kind !== ActorKind.Human) {
      return failure(
        new HarnessError(
          HarnessErrorCode.OperationForbidden,
          "Planning Review 只能由 Human 执行语义确认。",
        ),
      );
    }

    const review = parseConfirmedPlanningReview(input);
    if (review.status === ResultStatus.Failure) return review;
    if (review.value.kind === PlanRiskReviewKind.BusinessLogic) {
      return this.confirmBusinessLogic(input, review.value.proposal, actor.value);
    }

    const proposalDraft = review.value.proposal;
    let proposal: PlanRiskProposal;
    if (proposalDraft.payload.historicalLogicChange) {
      const businessLogic = await loadApprovedBusinessLogic(this.repository, input);
      if (businessLogic.status === ResultStatus.Failure) return businessLogic;
      proposal = {
        ...proposalDraft,
        payload: {
          ...proposalDraft.payload,
          businessLogicArtifactDigest: businessLogic.value.digest,
        },
      };
    } else {
      proposal = proposalDraft;
    }
    return this.confirmPlan(input, proposal, actor.value);
  }

  private async confirmBusinessLogic(
    input: ConfirmPlanRiskInput,
    proposal: BusinessLogicChangeContractProposal,
    actor: ConfirmPlanRiskInput["actor"],
  ): Promise<Result<ConfirmBusinessLogicOutput, HarnessError>> {
    const identity = this.calculateIdentity(input, proposal, actor);
    if (identity.status === ResultStatus.Failure) return identity;
    const proposed = await this.proposeArtifact.execute({
      workspaceId: input.workspaceId,
      taskId: input.taskId,
      proposal,
      actor,
      idempotencyKey: `${BUSINESS_LOGIC_PROPOSAL_IDEMPOTENCY_PREFIX}${identity.value}`,
    });
    if (proposed.status === ResultStatus.Failure) return proposed;
    if (proposed.value.artifact.artifactType !== ArtifactType.BusinessLogicChangeContract) {
      return failure(corruptConfirmation("持久化结果不是 Business Logic Artifact。"));
    }
    if (proposed.value.gateEvaluation.result === GateEvaluationResult.Allow) {
      return success({
        confirmationStatus: PlanRiskConfirmationStatus.Confirmed,
        artifactType: ArtifactType.BusinessLogicChangeContract,
        nextStep: PlanRiskNextStep.ReanalyzePlanRisk,
        proposal,
        artifact: proposed.value.artifact,
        gateEvaluation: proposed.value.gateEvaluation,
        task: proposed.value.task,
      });
    }
    const request = proposed.value.decisionRequest;
    if (
      proposed.value.gateEvaluation.result !== GateEvaluationResult.WaitingHuman ||
      request === undefined ||
      request.gate !== GateId.G2BusinessLogic
    ) {
      return failure(corruptConfirmation("Business Logic 未生成唯一 G2 DecisionRequest。"));
    }
    const approved = await this.recordApproval.execute({
      workspaceId: input.workspaceId,
      taskId: input.taskId,
      decisionRequestId: request.decisionRequestId,
      decisionRequestDigest: request.digest,
      idempotencyKey: `${BUSINESS_LOGIC_APPROVAL_IDEMPOTENCY_PREFIX}${identity.value}`,
      actor,
      decision: ApprovalDecision.Approved,
    });
    if (approved.status === ResultStatus.Failure) return approved;
    if (approved.value.gateEvaluation.result !== GateEvaluationResult.Allow) {
      return failure(corruptConfirmation("G2 Approval 后 Business Logic Gate 仍未通过。"));
    }
    return success({
      confirmationStatus: PlanRiskConfirmationStatus.Confirmed,
      artifactType: ArtifactType.BusinessLogicChangeContract,
      nextStep: PlanRiskNextStep.ReanalyzePlanRisk,
      proposal,
      artifact: proposed.value.artifact,
      approval: approved.value.approval,
      gateEvaluation: approved.value.gateEvaluation,
      task: approved.value.task,
    });
  }

  private async confirmPlan(
    input: ConfirmPlanRiskInput,
    proposal: PlanRiskProposal,
    actor: ConfirmPlanRiskInput["actor"],
  ): Promise<Result<ConfirmPlanRiskReviewOutput, HarnessError>> {
    const identity = this.calculateIdentity(input, proposal, actor);
    if (identity.status === ResultStatus.Failure) return identity;
    const proposed = await this.proposeArtifact.execute({
      workspaceId: input.workspaceId,
      taskId: input.taskId,
      proposal,
      actor,
      idempotencyKey: `${PLAN_RISK_PROPOSAL_IDEMPOTENCY_PREFIX}${identity.value}`,
    });
    if (proposed.status === ResultStatus.Failure) return proposed;
    if (proposed.value.artifact.artifactType !== ArtifactType.PlanRisk) {
      return failure(corruptConfirmation("持久化结果不是 PlanRisk Artifact。"));
    }
    if (proposed.value.gateEvaluation.result === GateEvaluationResult.Allow) {
      return success({
        confirmationStatus: PlanRiskConfirmationStatus.Confirmed,
        artifactType: ArtifactType.PlanRisk,
        nextStep: PlanRiskNextStep.CodingTask,
        proposal,
        artifact: proposed.value.artifact,
        gateEvaluation: proposed.value.gateEvaluation,
        task: proposed.value.task,
      });
    }
    const request = proposed.value.decisionRequest;
    if (
      proposed.value.gateEvaluation.result !== GateEvaluationResult.WaitingHuman ||
      request === undefined ||
      request.gate !== GateId.G4RiskOperation
    ) {
      return failure(corruptConfirmation("R2/R3 PlanRisk 未生成唯一 G4 DecisionRequest。"));
    }
    const approved = await this.recordApproval.execute({
      workspaceId: input.workspaceId,
      taskId: input.taskId,
      decisionRequestId: request.decisionRequestId,
      decisionRequestDigest: request.digest,
      idempotencyKey: `${PLAN_RISK_APPROVAL_IDEMPOTENCY_PREFIX}${identity.value}`,
      actor,
      decision: ApprovalDecision.Approved,
    });
    if (approved.status === ResultStatus.Failure) return approved;
    if (approved.value.gateEvaluation.result !== GateEvaluationResult.Allow) {
      return failure(corruptConfirmation("G4 Approval 后 PlanRisk Gate 仍未通过。"));
    }
    return success({
      confirmationStatus: PlanRiskConfirmationStatus.Confirmed,
      artifactType: ArtifactType.PlanRisk,
      nextStep: PlanRiskNextStep.CodingTask,
      proposal,
      artifact: proposed.value.artifact,
      approval: approved.value.approval,
      gateEvaluation: approved.value.gateEvaluation,
      task: approved.value.task,
    });
  }

  private calculateIdentity(
    input: ConfirmPlanRiskInput,
    proposal: BusinessLogicChangeContractProposal | PlanRiskProposal,
    actor: ConfirmPlanRiskInput["actor"],
  ) {
    return this.digestPort.calculate({
      schemaVersion: PLAN_RISK_CONFIRMATION_SCHEMA_VERSION,
      workspaceId: input.workspaceId,
      taskId: input.taskId,
      repositoryId: input.repositoryId,
      actor,
      proposal,
    });
  }
}

function corruptConfirmation(message: string): HarnessError {
  return new HarnessError(HarnessErrorCode.CorruptStore, message, {
    operation: "plan_risk_confirmation",
  });
}
