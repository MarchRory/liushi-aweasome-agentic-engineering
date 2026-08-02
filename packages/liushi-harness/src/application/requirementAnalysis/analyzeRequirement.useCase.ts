import type { RequirementAnalysisAgent } from "#application/ports/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";

import type {
  AnalyzeRequirementInput,
  AnalyzeRequirementOutput,
} from "./requirementAnalysis.contracts.js";
import { RequirementAnalysisStatus } from "./requirementAnalysis.enums.js";
import { parseUnconfirmedRequirementProposal } from "./requirementProposalValidation.js";

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

    const parsed = parseUnconfirmedRequirementProposal(analyzed.value, input.repositoryId);
    if (parsed.status === ResultStatus.Failure) return parsed;
    const proposal = parsed.value;

    return success({
      workspaceId: input.workspaceId,
      repositoryId: input.repositoryId,
      proposal,
      analysisStatus:
        proposal.payload.unknowns.length === 0
          ? RequirementAnalysisStatus.ReadyForReview
          : RequirementAnalysisStatus.HumanBattleRequired,
      humanQuestions: proposal.payload.unknowns,
      reviewDraft: {
        proposal,
        answers: proposal.payload.unknowns.map((question) => ({ question, answer: "" })),
      },
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
