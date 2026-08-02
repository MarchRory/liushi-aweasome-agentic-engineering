import type { RequirementAnalysisAgent } from "#application/ports/index.js";
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

import type {
  AnalyzeRequirementInput,
  AnalyzeRequirementOutput,
} from "./requirementAnalysis.contracts.js";
import { RequirementAnalysisStatus } from "./requirementAnalysis.enums.js";

/** 将只读 Agent 输出收敛为可由 Human 审阅的 Requirement Contract Proposal。 */
export class AnalyzeRequirementUseCase {
  public constructor(private readonly agent: RequirementAnalysisAgent) {}

  /** 执行一次无状态、无 Repository 写入的 Requirement 分析。 */
  public async execute(
    input: AnalyzeRequirementInput,
  ): Promise<Result<AnalyzeRequirementOutput, HarnessError>> {
    const inputError = validateInput(input);
    if (inputError !== undefined) return failure(inputError);

    const analyzed = await this.agent.analyze({
      repositoryId: input.repositoryId,
      repositoryRoot: input.repositoryRoot,
      prdSource: input.prdSource,
      prdContent: input.prdContent,
    });
    if (analyzed.status === ResultStatus.Failure) return analyzed;

    const parsed = parseArtifactProposal(analyzed.value);
    if (parsed.status === ResultStatus.Failure) {
      return failure(
        new HarnessError(
          HarnessErrorCode.InvalidInput,
          "Requirement analysis agent returned an invalid Artifact Proposal.",
          { source: "requirement_analysis_agent" },
          parsed.error,
        ),
      );
    }
    if (parsed.value.artifactType !== ArtifactType.RequirementContract) {
      return failure(
        new HarnessError(
          HarnessErrorCode.InvalidInput,
          "Requirement analysis agent must return a Requirement Contract Proposal.",
          { artifactType: parsed.value.artifactType },
        ),
      );
    }

    const proposal = parsed.value;
    const boundaryError = validateProposalBoundary(proposal, input.repositoryId);
    if (boundaryError !== undefined) return failure(boundaryError);

    return success({
      workspaceId: input.workspaceId,
      repositoryId: input.repositoryId,
      proposal,
      analysisStatus:
        proposal.payload.unknowns.length === 0
          ? RequirementAnalysisStatus.ReadyForReview
          : RequirementAnalysisStatus.HumanBattleRequired,
      humanQuestions: proposal.payload.unknowns,
    });
  }
}

function validateInput(input: AnalyzeRequirementInput): HarnessError | undefined {
  const required = [
    ["workspaceId", input.workspaceId],
    ["repositoryId", input.repositoryId],
    ["repositoryRoot", input.repositoryRoot],
    ["prdSource", input.prdSource],
    ["prdContent", input.prdContent],
  ] as const;
  const empty = required.find(([, value]) => value.trim().length === 0);
  return empty === undefined
    ? undefined
    : new HarnessError(HarnessErrorCode.InvalidInput, "Requirement analysis input is empty.", {
        field: empty[0],
      });
}

function validateProposalBoundary(
  proposal: RequirementContractProposal,
  repositoryId: string,
): HarnessError | undefined {
  if (
    proposal.payload.repositories.length !== 1 ||
    proposal.payload.repositories[0] !== repositoryId
  ) {
    return new HarnessError(
      HarnessErrorCode.InvalidInput,
      "Requirement analysis must remain bound to the selected Repository.",
      { repositoryId },
    );
  }
  if (proposal.payload.humanAnswers.length !== 0) {
    return new HarnessError(
      HarnessErrorCode.OperationForbidden,
      "Requirement analysis agent cannot provide Human answers.",
      { field: "humanAnswers" },
    );
  }

  const evidenceIds = new Set(proposal.payload.evidence.map((evidence) => evidence.evidenceId));
  const missingEvidenceId = proposal.payload.claims
    .flatMap((claim) => claim.evidenceIds)
    .find((evidenceId) => !evidenceIds.has(evidenceId));
  return missingEvidenceId === undefined
    ? undefined
    : new HarnessError(
        HarnessErrorCode.InvalidInput,
        "Requirement analysis claim references missing evidence.",
        { evidenceId: missingEvidenceId },
      );
}
