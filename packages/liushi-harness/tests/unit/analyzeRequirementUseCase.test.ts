import { describe, expect, it } from "vitest";

import {
  AnalyzeRequirementUseCase,
  RequirementAnalysisStatus,
  type RequirementAnalysisAgent,
} from "../../src/application/index.js";
import { HarnessErrorCode, ResultStatus, success } from "../../src/common/index.js";
import {
  ArtifactStatus,
  ArtifactType,
  ClaimClassification,
  EvidenceKind,
  type RequirementContractProposal,
} from "../../src/domain/index.js";

describe("AnalyzeRequirementUseCase", () => {
  it("将合法 Proposal 收敛为 Human Battle 输入", async () => {
    const result = await executeWith(createProposal({ unknowns: ["权限范围是否包含访客？"] }));

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Failure) return;
    expect(result.value.analysisStatus).toBe(RequirementAnalysisStatus.HumanBattleRequired);
    expect(result.value.humanQuestions).toEqual(["权限范围是否包含访客？"]);
    expect(result.value.proposal.payload.humanAnswers).toEqual([]);
  });

  it("没有未决问题时仍停在 Human 语义审阅", async () => {
    const result = await executeWith(createProposal());

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Failure) return;
    expect(result.value.analysisStatus).toBe(RequirementAnalysisStatus.ReadyForReview);
  });

  it("拒绝 Agent 伪造 Human Answers", async () => {
    const result = await executeWith(createProposal({ humanAnswers: ["已由产品确认"] }));

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Success) return;
    expect(result.error.code).toBe(HarnessErrorCode.OperationForbidden);
  });

  it("拒绝扩大到未选择的 Repository", async () => {
    const result = await executeWith(createProposal({ repositories: ["repo-a", "repo-b"] }));

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Success) return;
    expect(result.error.code).toBe(HarnessErrorCode.InvalidInput);
  });

  it("拒绝 Claim 引用不存在的 Evidence", async () => {
    const proposal = createProposal();
    const result = await executeWith({
      ...proposal,
      payload: {
        ...proposal.payload,
        claims: [
          {
            claimId: "claim-1",
            statement: "必须保留现有权限行为。",
            classification: ClaimClassification.Fact,
            evidenceIds: ["missing-evidence"],
          },
        ],
      },
    });

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Success) return;
    expect(result.error.details).toEqual({ evidenceId: "missing-evidence" });
  });
});

async function executeWith(proposal: unknown) {
  const agent: RequirementAnalysisAgent = {
    analyze: () => Promise.resolve(success(proposal)),
  };
  return new AnalyzeRequirementUseCase(agent).execute({
    workspaceId: "workspace-a",
    repositoryId: "repo-a",
    repositoryRoot: "C:\\workspace\\repo-a",
    prdSource: "feature.md",
    prdContent: "新增可观察的权限提示。",
  });
}

function createProposal(
  overrides: Partial<RequirementContractProposal["payload"]> = {},
): RequirementContractProposal {
  return {
    artifactType: ArtifactType.RequirementContract,
    status: ArtifactStatus.Proposed,
    payload: {
      problem: "用户无法识别当前权限状态。",
      goals: ["展示明确权限状态"],
      nonGoals: ["修改权限模型"],
      observableBehaviors: ["用户可以看到当前权限"],
      acceptanceCriteria: ["权限文案与实际状态一致"],
      includedScopes: ["权限提示组件"],
      forbiddenScopes: ["权限计算逻辑"],
      repositories: ["repo-a"],
      edgeCases: ["权限信息缺失"],
      compatibilityConstraints: ["保持现有权限行为"],
      evidence: [
        {
          evidenceId: "prd",
          kind: EvidenceKind.File,
          source: "prd",
          title: "feature.md",
          locator: "feature.md",
        },
      ],
      claims: [],
      unknowns: [],
      humanAnswers: [],
      ...overrides,
    },
  };
}
