import { describe, expect, it } from "vitest";

import { PROJECT_PROFILE_PROPOSAL_SCHEMA_VERSION, ResultStatus } from "../../src/common/index.js";
import {
  ArtifactStatus,
  ArtifactType,
  parseArtifactDigest,
  parseArtifactId,
  parseArtifactProposal,
  validateArtifactEvidence,
} from "../../src/domain/artifact/index.js";
import { parseApprovalId, parseDecisionRequestId } from "../../src/domain/approval/index.js";
import { ClaimClassification, EvidenceKind } from "../../src/domain/evidence/index.js";
import { GateId, RiskLevel } from "../../src/domain/gate/index.js";
import { RepositoryRole } from "../../src/domain/projectDiscovery/index.js";
import {
  VerificationKind,
  VerificationRequirement,
  VerificationSelectionMode,
} from "../../src/domain/verification/index.js";

const validDigest = `sha256:${"a".repeat(64)}`;

describe("Artifact proposal contracts", () => {
  it("parses a valid RequirementContract proposal", () => {
    const result = parseArtifactProposal(createRequirementProposal());

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Success) {
      expect(result.value.artifactType).toBe(ArtifactType.RequirementContract);
      expect(result.value.status).toBe(ArtifactStatus.Proposed);
    }
  });

  it("rejects RequirementContract fact claims without evidence", () => {
    const proposal = createRequirementProposal();
    proposal.payload.claims = [
      {
        claimId: "claim-2",
        statement: "事实声明必须被证据支撑",
        classification: ClaimClassification.Fact,
        evidenceIds: [],
      },
    ];

    const result = parseArtifactProposal(proposal);

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Failure) {
      expect(result.error.code).toBe("invalid_input");
      expect(result.error.details["path"]).toContain("evidenceIds");
    }
  });

  it("rejects Claim references to Evidence missing from the Artifact", () => {
    const parsed = parseArtifactProposal(createRequirementProposal());
    if (
      parsed.status === ResultStatus.Failure ||
      parsed.value.artifactType !== ArtifactType.RequirementContract
    ) {
      throw new Error("Expected RequirementContract proposal.");
    }
    const firstClaim = parsed.value.payload.claims[0];
    if (firstClaim === undefined) {
      throw new Error("Expected RequirementContract claim fixture.");
    }
    const proposal = {
      ...parsed.value,
      payload: {
        ...parsed.value.payload,
        claims: [
          {
            ...firstClaim,
            evidenceIds: ["missing-evidence"],
          },
        ],
      },
    };

    expect(validateArtifactEvidence(proposal).status).toBe(ResultStatus.Failure);
  });

  it("parses a valid BusinessLogicChangeContract proposal", () => {
    const result = parseArtifactProposal(createBusinessLogicProposal());

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Success) {
      expect(result.value.artifactType).toBe(ArtifactType.BusinessLogicChangeContract);
      expect(result.value.status).toBe(ArtifactStatus.Proposed);
    }
  });

  it("rejects BusinessLogicChangeContract proposals with unknown fields", () => {
    const proposal = {
      ...createBusinessLogicProposal(),
      unexpected: true,
    };

    const result = parseArtifactProposal(proposal);

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Failure) {
      expect(result.error.details["issue"]).toContain("Unrecognized key");
    }
  });

  it("parses a valid PlanRisk proposal", () => {
    const result = parseArtifactProposal(createPlanRiskProposal());

    expect(result.status).toBe(ResultStatus.Success);
    if (
      result.status === ResultStatus.Success &&
      result.value.artifactType === ArtifactType.PlanRisk
    ) {
      expect(result.value.payload.historicalLogicChange).toBe(false);
    }
  });

  it("requires a business logic artifact digest for historical logic changes", () => {
    const proposal = createPlanRiskProposal();
    proposal.payload.historicalLogicChange = true;

    const result = parseArtifactProposal(proposal);

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Failure) {
      expect(result.error.details["path"]).toBe("payload.businessLogicArtifactDigest");
    }
  });

  it("accepts R4 PlanRisk so later Gate evaluation can forbid it", () => {
    const proposal = createPlanRiskProposal();
    proposal.payload.riskLevel = RiskLevel.R4;

    const result = parseArtifactProposal(proposal);

    expect(result.status).toBe(ResultStatus.Success);
  });

  it("parses a valid ProjectProfileProposal proposal without evidence", () => {
    const result = parseArtifactProposal(createProjectProfileProposal());

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Success) {
      expect(result.value.artifactType).toBe(ArtifactType.ProjectProfileProposal);
      expect(validateArtifactEvidence(result.value).status).toBe(ResultStatus.Success);
    }
  });

  it.each([
    ["unknown top-level field", { unexpected: true }],
    ["missing payload schemaVersion", { payload: { schemaVersion: undefined } }],
    ["old payload schemaVersion", { payload: { schemaVersion: "1.0.0" } }],
    [
      "duplicate repository",
      {
        payload: {
          repositorySelections: [
            createRepositorySelection("repo-a"),
            createRepositorySelection("repo-a"),
          ],
        },
      },
    ],
    [
      "duplicate accepted Rule IDs",
      {
        payload: {
          repositorySelections: [
            {
              ...createRepositorySelection("repo-a"),
              acceptedRuleIds: ["rule-a", "rule-a"],
            },
          ],
        },
      },
    ],
    [
      "accepted/rejected Rule ID overlap",
      {
        payload: {
          repositorySelections: [
            {
              ...createRepositorySelection("repo-a"),
              acceptedRuleIds: ["rule-a"],
              rejectedRuleIds: ["rule-a"],
            },
          ],
        },
      },
    ],
    [
      "accepted/rejected mechanism candidate ID overlap",
      {
        payload: {
          repositorySelections: [
            {
              ...createRepositorySelection("repo-a"),
              acceptedMechanismCandidateIds: ["mechanism-a"],
              rejectedMechanismCandidateIds: ["mechanism-a"],
            },
          ],
        },
      },
    ],
    [
      "Unknown repository role",
      {
        payload: {
          repositorySelections: [
            {
              ...createRepositorySelection("repo-a"),
              confirmedRole: RepositoryRole.Unknown,
            },
          ],
        },
      },
    ],
    [
      "missing verification checks",
      {
        payload: {
          repositorySelections: [
            { ...createRepositorySelection("repo-a"), verificationChecks: undefined },
          ],
        },
      },
    ],
    [
      "unknown verification check field",
      {
        payload: {
          repositorySelections: [
            {
              ...createRepositorySelection("repo-a"),
              verificationChecks: [{ ...createVerificationCheck(), unexpected: true }],
            },
          ],
        },
      },
    ],
    [
      "unordered verification checks",
      {
        payload: {
          repositorySelections: [
            {
              ...createRepositorySelection("repo-a"),
              verificationChecks: [
                { ...createVerificationCheck(), checkId: "project.z" },
                { ...createVerificationCheck(), checkId: "project.a" },
              ],
            },
          ],
        },
      },
    ],
    [
      "duplicate verification checks",
      {
        payload: {
          repositorySelections: [
            {
              ...createRepositorySelection("repo-a"),
              verificationChecks: [createVerificationCheck(), createVerificationCheck()],
            },
          ],
        },
      },
    ],
    [
      "invalid verification selection mode and path glob",
      {
        payload: {
          repositorySelections: [
            {
              ...createRepositorySelection("repo-a"),
              verificationChecks: [
                {
                  ...createVerificationCheck(),
                  requirement: VerificationRequirement.Conditional,
                  selectionMode: VerificationSelectionMode.ChangedPaths,
                  pathGlobs: ["../src/**"],
                },
              ],
            },
          ],
        },
      },
    ],
    [
      "invalid verification validator",
      {
        payload: {
          repositorySelections: [
            {
              ...createRepositorySelection("repo-a"),
              verificationChecks: [
                { ...createVerificationCheck(), validatorIds: ["Invalid Validator"] },
              ],
            },
          ],
        },
      },
    ],
  ])("rejects ProjectProfileProposal with %s", (_name, override) => {
    const proposal = mergeProjectProfileProposal(createProjectProfileProposal(), override);

    const result = parseArtifactProposal(proposal);

    expect(result.status).toBe(ResultStatus.Failure);
  });

  it("rejects non-Proposed proposal statuses", () => {
    const proposal = {
      ...createPlanRiskProposal(),
      status: ArtifactStatus.Approved,
    };

    const result = parseArtifactProposal(proposal);

    expect(result.status).toBe(ResultStatus.Failure);
  });

  it("parses branded IDs and SHA-256 digests through guards", () => {
    expect(parseArtifactId("01ARZ3NDEKTSV4RRFFQ69G5FAV").status).toBe(ResultStatus.Success);
    expect(parseArtifactId("not-a-ulid").status).toBe(ResultStatus.Failure);
    expect(parseArtifactDigest(validDigest).status).toBe(ResultStatus.Success);
    expect(parseArtifactDigest("a".repeat(64)).status).toBe(ResultStatus.Failure);
    expect(parseDecisionRequestId("01ARZ3NDEKTSV4RRFFQ69G5FAV").status).toBe(ResultStatus.Success);
    expect(parseApprovalId("01ARZ3NDEKTSV4RRFFQ69G5FAV").status).toBe(ResultStatus.Success);
  });
});

function createRequirementProposal() {
  return {
    artifactType: ArtifactType.RequirementContract,
    status: ArtifactStatus.Proposed,
    payload: {
      problem: "需要建立需求契约",
      goals: ["形成可验证目标"],
      nonGoals: ["不执行实现"],
      observableBehaviors: ["解析后可被 Use Case 消费"],
      acceptanceCriteria: ["有效 proposal 返回 success"],
      includedScopes: ["domain artifact"],
      forbiddenScopes: ["infrastructure"],
      repositories: ["liushi-harness"],
      edgeCases: ["未知项允许为空 evidence"],
      compatibilityConstraints: ["不破坏现有 Task 状态机"],
      evidence: [createEvidenceRef()],
      claims: [createFactClaim()],
      unknowns: ["后续 Use Case 如何持久化"],
      humanAnswers: ["已确认本切片只做契约"],
    },
  };
}

function createBusinessLogicProposal() {
  return {
    artifactType: ArtifactType.BusinessLogicChangeContract,
    status: ArtifactStatus.Proposed,
    payload: {
      currentBehavior: {
        facts: [createFactClaim()],
        inferences: [
          {
            claimId: "claim-2",
            statement: "当前没有领域契约解析入口",
            classification: ClaimClassification.Inference,
            evidenceIds: ["ev-1"],
          },
        ],
      },
      plannedBehavior: ["新增强类型 Proposal"],
      differences: ["从无契约变为 strict schema"],
      affectedConsumers: ["下一语义 Use Case"],
      invariants: ["不进行 I/O"],
      rollback: ["移除新增契约文件"],
      evidence: [createEvidenceRef()],
      unknowns: ["Core Gate 重算规则未在本切片实现"],
    },
  };
}

function createPlanRiskProposal() {
  return {
    artifactType: ArtifactType.PlanRisk,
    status: ArtifactStatus.Proposed,
    payload: {
      steps: [{ order: 1, action: "新增领域契约" }],
      readSet: ["packages/liushi-harness/src/domain"],
      writeSet: ["packages/liushi-harness/src/domain/artifact"],
      risks: [{ description: "类型边界过宽", mitigation: "使用 strict schema" }],
      riskLevel: RiskLevel.R2,
      historicalLogicChange: false,
      riskOperations: [{ target: "domain contracts", reason: "影响后续 Use Case 输入" }],
      testPlan: ["运行 artifact contract 单测"],
      rollbackPlan: ["删除本切片新增文件"],
      requiredGates: [GateId.G1Requirement, GateId.G2BusinessLogic],
    },
  };
}

function createProjectProfileProposal() {
  return {
    artifactType: ArtifactType.ProjectProfileProposal,
    status: ArtifactStatus.Proposed,
    payload: {
      schemaVersion: PROJECT_PROFILE_PROPOSAL_SCHEMA_VERSION,
      discoveryReportDigest: validDigest,
      workspaceGraphRevision: "graph-rev-1",
      repositorySelections: [createRepositorySelection("repo-a")],
    },
  };
}

function createRepositorySelection(repositoryId: string) {
  return {
    repositoryId,
    repositoryRevision: "repo-rev-1",
    profileCandidateDigest: validDigest,
    confirmedRole: RepositoryRole.Application,
    acceptedRuleIds: ["rule-a"],
    rejectedRuleIds: ["rule-b"],
    acceptedMechanismCandidateIds: ["mechanism-a"],
    rejectedMechanismCandidateIds: ["mechanism-b"],
    verificationChecks: [createVerificationCheck()],
  };
}

function createVerificationCheck() {
  return {
    checkId: "project.typecheck",
    kind: VerificationKind.Typecheck,
    requirement: VerificationRequirement.Required,
    command: {
      executable: "corepack",
      args: ["pnpm", "typecheck"],
      workingDirectory: "",
      allowedEnvironmentKeys: ["CI", "PATH"],
    },
    timeoutMs: 120_000,
    retryable: false,
    selectionMode: VerificationSelectionMode.Always,
    validatorIds: ["typescript.typecheck"],
  };
}

function mergeProjectProfileProposal(
  proposal: ReturnType<typeof createProjectProfileProposal>,
  override: Record<string, unknown>,
) {
  return {
    ...proposal,
    ...override,
    payload: {
      ...proposal.payload,
      ...((override["payload"] as Record<string, unknown> | undefined) ?? {}),
    },
  };
}

function createEvidenceRef() {
  return {
    evidenceId: "ev-1",
    kind: EvidenceKind.File,
    source: "docs/02-artifact-contracts.md",
    title: "已批准的 Artifact 契约",
  };
}

function createFactClaim() {
  return {
    claimId: "claim-1",
    statement: "fact claim 至少需要一个 evidenceId",
    classification: ClaimClassification.Fact,
    evidenceIds: ["ev-1"],
  };
}
