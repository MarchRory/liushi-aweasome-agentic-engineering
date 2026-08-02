import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import {
  ArtifactType,
  parseArtifactProposal,
  type RequirementContractProposal,
} from "#domain/artifact/index.js";

import { MAX_REQUIREMENT_HUMAN_QUESTIONS } from "./requirementAnalysis.constants.js";

/** 解析并校验尚未经过 Human 确认的单仓 Requirement Proposal。 */
export function parseUnconfirmedRequirementProposal(
  input: unknown,
  repositoryId: string,
): Result<RequirementContractProposal, HarnessError> {
  const parsed = parseArtifactProposal(input);
  if (parsed.status === ResultStatus.Failure) {
    return failure(
      new HarnessError(
        HarnessErrorCode.InvalidInput,
        "Requirement Proposal 不符合 Artifact 契约。",
        { source: "requirement_proposal" },
        parsed.error,
      ),
    );
  }
  if (parsed.value.artifactType !== ArtifactType.RequirementContract) {
    return failure(
      new HarnessError(
        HarnessErrorCode.InvalidInput,
        "Requirement 流程只接受 Requirement Contract Proposal。",
        { artifactType: parsed.value.artifactType },
      ),
    );
  }

  const proposal = parsed.value;
  if (
    proposal.payload.repositories.length !== 1 ||
    proposal.payload.repositories[0] !== repositoryId
  ) {
    return failure(
      new HarnessError(
        HarnessErrorCode.InvalidInput,
        "Requirement Proposal 必须保持在选定的单一 Repository 内。",
        { repositoryId },
      ),
    );
  }
  if (proposal.payload.humanAnswers.length !== 0) {
    return failure(
      new HarnessError(
        HarnessErrorCode.OperationForbidden,
        "未确认的 Requirement Proposal 不能预填 Human Answer。",
        { field: "humanAnswers" },
      ),
    );
  }
  if (proposal.payload.unknowns.length > MAX_REQUIREMENT_HUMAN_QUESTIONS) {
    return failure(
      new HarnessError(
        HarnessErrorCode.InvalidInput,
        "Requirement Proposal 的 Human Battle 问题超过单轮上限。",
        { maxQuestions: String(MAX_REQUIREMENT_HUMAN_QUESTIONS) },
      ),
    );
  }
  if (new Set(proposal.payload.unknowns).size !== proposal.payload.unknowns.length) {
    return failure(
      new HarnessError(
        HarnessErrorCode.InvalidInput,
        "Requirement Proposal 包含重复的 Human Battle 问题。",
        { field: "unknowns" },
      ),
    );
  }

  const evidenceIds = new Set(proposal.payload.evidence.map((evidence) => evidence.evidenceId));
  const missingEvidenceId = proposal.payload.claims
    .flatMap((claim) => claim.evidenceIds)
    .find((evidenceId) => !evidenceIds.has(evidenceId));
  return missingEvidenceId === undefined
    ? success(proposal)
    : failure(
        new HarnessError(
          HarnessErrorCode.InvalidInput,
          "Requirement Proposal 的 Claim 引用了不存在的 Evidence。",
          { evidenceId: missingEvidenceId },
        ),
      );
}
