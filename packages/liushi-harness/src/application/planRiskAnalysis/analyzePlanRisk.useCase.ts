import type {
  PlanRiskAnalysisAgent,
  RepositoryRootResolverPort,
  TaskRepository,
} from "#application/ports/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";

import type { AnalyzePlanRiskInput, AnalyzePlanRiskOutput } from "./planRiskAnalysis.contracts.js";
import { PlanRiskAnalysisStatus, PlanRiskReviewKind } from "./planRiskAnalysis.enums.js";
import { parsePlanRiskAgentCandidate } from "./planRiskAnalysisValidation.js";
import { loadApprovedPlanningContext } from "./planningContext.js";

/** 将批准后的 Requirement 与代码上下文收敛为 Human 可审阅的 Planning Proposal。 */
export class AnalyzePlanRiskUseCase {
  public constructor(
    private readonly repository: TaskRepository,
    private readonly repositoryRootResolver: RepositoryRootResolverPort,
    private readonly agent: PlanRiskAnalysisAgent,
  ) {}

  /** 执行一次无 Repository 写入的 PlanRisk 分析。 */
  public async execute(
    input: AnalyzePlanRiskInput,
  ): Promise<Result<AnalyzePlanRiskOutput, HarnessError>> {
    const inputError = validateInput(input);
    if (inputError !== undefined) return failure(inputError);

    const context = await loadApprovedPlanningContext(this.repository, input);
    if (context.status === ResultStatus.Failure) return context;
    const repositoryRoot = await this.repositoryRootResolver.resolve({
      workspaceId: input.workspaceId,
      repositoryId: input.repositoryId,
    });
    if (repositoryRoot.status === ResultStatus.Failure) return repositoryRoot;
    const analyzed = await this.agent.analyze({
      repositoryId: input.repositoryId,
      repositoryRoot: repositoryRoot.value.repositoryRoot,
      requirement: context.value.requirement.payload,
      ...(context.value.businessLogic === undefined
        ? {}
        : { approvedBusinessLogic: context.value.businessLogic.payload }),
    });
    if (analyzed.status === ResultStatus.Failure) return analyzed;

    const candidate = parsePlanRiskAgentCandidate(
      analyzed.value,
      context.value.businessLogic !== undefined,
    );
    if (candidate.status === ResultStatus.Failure) return candidate;
    const base = {
      workspaceId: input.workspaceId,
      taskId: input.taskId,
      repositoryId: input.repositoryId,
    };
    if (candidate.value.kind === PlanRiskReviewKind.BusinessLogic) {
      const proposal = candidate.value.proposal;
      return success({
        ...base,
        analysisStatus: PlanRiskAnalysisStatus.BusinessLogicReviewRequired,
        proposal,
        humanQuestions: proposal.payload.unknowns,
        reviewDraft: {
          kind: PlanRiskReviewKind.BusinessLogic,
          proposal,
          answers: proposal.payload.unknowns.map((question) => ({ question, answer: "" })),
        },
      });
    }

    return success({
      ...base,
      analysisStatus: PlanRiskAnalysisStatus.PlanRiskReviewRequired,
      proposal: candidate.value.proposal,
      humanQuestions: [],
      reviewDraft: {
        kind: PlanRiskReviewKind.PlanRisk,
        proposal: candidate.value.proposal,
      },
    });
  }
}

function validateInput(input: AnalyzePlanRiskInput): HarnessError | undefined {
  const required = [
    ["workspaceId", input.workspaceId],
    ["taskId", input.taskId],
    ["repositoryId", input.repositoryId],
  ] as const;
  const empty = required.find(([, value]) => value.trim().length === 0);
  return empty === undefined
    ? undefined
    : new HarnessError(HarnessErrorCode.InvalidInput, "PlanRisk analysis input is empty.", {
        field: empty[0],
      });
}
