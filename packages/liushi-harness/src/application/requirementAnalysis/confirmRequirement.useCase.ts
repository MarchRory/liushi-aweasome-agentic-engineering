import type { ArtifactDigestPort } from "#application/ports/index.js";
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
  requirementHumanAnswerSchema,
  type RequirementContractArtifact,
  type RequirementContractProposal,
  type RequirementHumanAnswer,
} from "#domain/artifact/index.js";
import { GateEvaluationResult, GateId } from "#domain/policy/index.js";
import { z } from "zod";

import {
  MAX_REQUIREMENT_HUMAN_QUESTIONS,
  REQUIREMENT_APPROVAL_IDEMPOTENCY_PREFIX,
  REQUIREMENT_CONFIRMATION_SCHEMA_VERSION,
  REQUIREMENT_PROPOSAL_IDEMPOTENCY_PREFIX,
} from "./requirementAnalysis.constants.js";
import type {
  ConfirmRequirementInput,
  ConfirmRequirementOutput,
} from "./requirementAnalysis.contracts.js";
import { RequirementConfirmationStatus, RequirementNextStep } from "./requirementAnalysis.enums.js";
import { parseUnconfirmedRequirementProposal } from "./requirementProposalValidation.js";

const requirementReviewSchema = z
  .object({
    proposal: z.unknown(),
    answers: z.array(requirementHumanAnswerSchema).max(MAX_REQUIREMENT_HUMAN_QUESTIONS),
  })
  .strict();

/** Human Review 后复用现有 Artifact 与 G1 Gate 完成 Requirement 确认。 */
export class ConfirmRequirementUseCase {
  public constructor(
    private readonly proposeArtifact: Pick<ProposeArtifactUseCase, "execute">,
    private readonly recordApproval: Pick<RecordApprovalUseCase, "execute">,
    private readonly digestPort: ArtifactDigestPort,
  ) {}

  /** 校验语义修订、内部绑定摘要并幂等持久化 Requirement 与 G1 Approval。 */
  public async execute(
    input: ConfirmRequirementInput,
  ): Promise<Result<ConfirmRequirementOutput, HarnessError>> {
    const actor = validateActorRef(input.actor);
    if (actor.status === ResultStatus.Failure) return actor;
    if (actor.value.kind !== ActorKind.Human) {
      return failure(
        new HarnessError(
          HarnessErrorCode.OperationForbidden,
          "Requirement 只能由 Human 执行语义确认。",
        ),
      );
    }

    const analysisProposal = parseUnconfirmedRequirementProposal(
      input.analysisProposal,
      input.repositoryId,
    );
    if (analysisProposal.status === ResultStatus.Failure) return analysisProposal;
    const review = parseReview(input.review, input.repositoryId);
    if (review.status === ResultStatus.Failure) return review;
    const coverageError = validateReviewCoverage(analysisProposal.value, review.value);
    if (coverageError !== undefined) return failure(coverageError);

    const proposal: RequirementContractProposal = {
      ...review.value.proposal,
      payload: {
        ...review.value.proposal.payload,
        unknowns: [],
        humanAnswers: review.value.answers,
      },
    };
    const identity = this.digestPort.calculate({
      schemaVersion: REQUIREMENT_CONFIRMATION_SCHEMA_VERSION,
      workspaceId: input.workspaceId,
      taskId: input.taskId,
      repositoryId: input.repositoryId,
      actor: actor.value,
      proposal,
    });
    if (identity.status === ResultStatus.Failure) return identity;

    const proposed = await this.proposeArtifact.execute({
      workspaceId: input.workspaceId,
      taskId: input.taskId,
      proposal,
      actor: actor.value,
      idempotencyKey: `${REQUIREMENT_PROPOSAL_IDEMPOTENCY_PREFIX}${identity.value}`,
    });
    if (proposed.status === ResultStatus.Failure) return proposed;
    if (proposed.value.artifact.artifactType !== ArtifactType.RequirementContract) {
      return failure(corruptConfirmation("Artifact 类型不是 Requirement Contract。"));
    }
    const artifact = proposed.value.artifact;

    if (proposed.value.gateEvaluation.result === GateEvaluationResult.Allow) {
      return success(
        createOutput(proposal, artifact, proposed.value.gateEvaluation, proposed.value.task),
      );
    }
    const decisionRequest = proposed.value.decisionRequest;
    if (
      proposed.value.gateEvaluation.result !== GateEvaluationResult.WaitingHuman ||
      decisionRequest === undefined ||
      decisionRequest.gate !== GateId.G1Requirement
    ) {
      return failure(corruptConfirmation("Requirement Proposal 未生成唯一 G1 DecisionRequest。"));
    }

    const approved = await this.recordApproval.execute({
      workspaceId: input.workspaceId,
      taskId: input.taskId,
      decisionRequestId: decisionRequest.decisionRequestId,
      decisionRequestDigest: decisionRequest.digest,
      idempotencyKey: `${REQUIREMENT_APPROVAL_IDEMPOTENCY_PREFIX}${identity.value}`,
      actor: actor.value,
      decision: ApprovalDecision.Approved,
    });
    if (approved.status === ResultStatus.Failure) return approved;
    if (approved.value.gateEvaluation.result !== GateEvaluationResult.Allow) {
      return failure(corruptConfirmation("G1 Approval 后 Requirement Gate 仍未通过。"));
    }

    return success(
      createOutput(
        proposal,
        artifact,
        approved.value.gateEvaluation,
        approved.value.task,
        approved.value.approval,
      ),
    );
  }
}

function parseReview(
  input: unknown,
  repositoryId: string,
): Result<
  {
    readonly proposal: RequirementContractProposal;
    readonly answers: readonly RequirementHumanAnswer[];
  },
  HarnessError
> {
  const parsed = requirementReviewSchema.safeParse(input);
  if (!parsed.success) {
    return failure(
      new HarnessError(HarnessErrorCode.InvalidInput, "Requirement Human Review 格式无效。", {
        field: "review",
      }),
    );
  }
  const proposal = parseUnconfirmedRequirementProposal(parsed.data.proposal, repositoryId);
  return proposal.status === ResultStatus.Failure
    ? proposal
    : success({ proposal: proposal.value, answers: parsed.data.answers });
}

function validateReviewCoverage(
  analysisProposal: RequirementContractProposal,
  review: {
    readonly proposal: RequirementContractProposal;
    readonly answers: readonly RequirementHumanAnswer[];
  },
): HarnessError | undefined {
  const questions = analysisProposal.payload.unknowns;
  if (!sameStrings(review.proposal.payload.unknowns, questions)) {
    return invalidReview("Review Proposal 必须保留原始 Human Battle 问题。", "proposal.unknowns");
  }
  if (
    review.answers.length !== questions.length ||
    review.answers.some((answer, index) => answer.question !== questions[index])
  ) {
    return invalidReview("Human Answer 必须按原始顺序完整覆盖全部问题。", "answers");
  }
  return undefined;
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function invalidReview(message: string, field: string): HarnessError {
  return new HarnessError(HarnessErrorCode.InvalidInput, message, { field });
}

function corruptConfirmation(message: string): HarnessError {
  return new HarnessError(HarnessErrorCode.CorruptStore, message, {
    operation: "requirement_confirmation",
  });
}

function createOutput(
  proposal: RequirementContractProposal,
  artifact: RequirementContractArtifact,
  gateEvaluation: ConfirmRequirementOutput["gateEvaluation"],
  task: ConfirmRequirementOutput["task"],
  approval?: ConfirmRequirementOutput["approval"],
): ConfirmRequirementOutput {
  return {
    confirmationStatus: RequirementConfirmationStatus.Confirmed,
    nextStep: RequirementNextStep.PlanRisk,
    proposal,
    artifact,
    ...(approval === undefined ? {} : { approval }),
    gateEvaluation,
    task,
  };
}
