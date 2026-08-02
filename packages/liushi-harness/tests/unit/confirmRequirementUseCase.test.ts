import { describe, expect, it, vi } from "vitest";

import { ConfirmRequirementUseCase } from "../../src/application/index.js";
import {
  ActorKind,
  HarnessErrorCode,
  ResultStatus,
  success,
  type ContentDigest,
} from "../../src/common/index.js";
import { ArtifactStatus, ArtifactType, EvidenceKind } from "../../src/domain/index.js";

const CONFIRMATION_DIGEST = `sha256:${"a".repeat(64)}` as ContentDigest;

describe("ConfirmRequirementUseCase", () => {
  it("缺答案或问题顺序不匹配时在任何写入前拒绝", async () => {
    const proposeArtifact = { execute: vi.fn() };
    const recordApproval = { execute: vi.fn() };
    const useCase = new ConfirmRequirementUseCase(proposeArtifact, recordApproval, digestPort());
    const analysisProposal = createProposal(["问题一", "问题二"]);

    for (const answers of [
      [{ question: "问题一", answer: "答案" }],
      [
        { question: "问题二", answer: "答案二" },
        { question: "问题一", answer: "答案一" },
      ],
    ]) {
      const result = await useCase.execute({
        workspaceId: "workspace-a",
        taskId: "01J00000000000000000000000",
        repositoryId: "repo-a",
        analysisProposal,
        review: { proposal: analysisProposal, answers },
        actor: { kind: ActorKind.Human, actorId: "human-a" },
      });
      expect(result.status).toBe(ResultStatus.Failure);
      if (result.status === ResultStatus.Success) continue;
      expect(result.error.code).toBe(HarnessErrorCode.InvalidInput);
    }
    expect(proposeArtifact.execute).not.toHaveBeenCalled();
    expect(recordApproval.execute).not.toHaveBeenCalled();
  });

  it("拒绝 Agent Actor 且不发生写入", async () => {
    const proposeArtifact = { execute: vi.fn() };
    const recordApproval = { execute: vi.fn() };
    const proposal = createProposal(["问题"]);
    const result = await new ConfirmRequirementUseCase(
      proposeArtifact,
      recordApproval,
      digestPort(),
    ).execute({
      workspaceId: "workspace-a",
      taskId: "01J00000000000000000000000",
      repositoryId: "repo-a",
      analysisProposal: proposal,
      review: { proposal, answers: [{ question: "问题", answer: "答案" }] },
      actor: { kind: ActorKind.Agent, actorId: "agent-a" },
    });

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Success) return;
    expect(result.error.code).toBe(HarnessErrorCode.OperationForbidden);
    expect(proposeArtifact.execute).not.toHaveBeenCalled();
  });

  it("复用 ProposeArtifact 和 G1 Approval，并支持已批准结果幂等重放", async () => {
    const proposal = createProposal(["问题"]);
    const artifact = { artifactType: ArtifactType.RequirementContract, artifactId: "artifact-a" };
    const waiting = {
      artifact,
      gateEvaluation: { result: "waiting_human", artifactId: "artifact-a" },
      decisionRequest: { gate: "G1", decisionRequestId: "request-a", digest: "sha256:request" },
      task: { taskId: "01J00000000000000000000000" },
    };
    const allowed = {
      artifact,
      gateEvaluation: { result: "allow", artifactId: "artifact-a" },
      task: { taskId: "01J00000000000000000000000" },
      approval: { approvalId: "approval-a" },
    };
    const proposeArtifact = {
      execute: vi
        .fn()
        .mockResolvedValueOnce(success(waiting))
        .mockResolvedValueOnce(success(allowed)),
    };
    const recordApproval = {
      execute: vi
        .fn()
        .mockResolvedValue(success({ ...allowed, approval: { approvalId: "approval-a" } })),
    };
    const useCase = new ConfirmRequirementUseCase(proposeArtifact, recordApproval, digestPort());
    const answers = [{ question: "问题", answer: "答案" }];
    const actor = { kind: ActorKind.Human, actorId: "human-a" };
    const reviewedProposal = {
      ...proposal,
      payload: { ...proposal.payload, problem: "Human 修订后的问题" },
    };
    const input = {
      workspaceId: "workspace-a",
      taskId: "01J00000000000000000000000",
      repositoryId: "repo-a",
      analysisProposal: proposal,
      review: { proposal: reviewedProposal, answers },
      actor,
    };

    const first = await useCase.execute(input);
    const second = await useCase.execute(input);

    expect(first.status).toBe(ResultStatus.Success);
    expect(second.status).toBe(ResultStatus.Success);
    expect(proposeArtifact.execute).toHaveBeenCalledTimes(2);
    expect(recordApproval.execute).toHaveBeenCalledTimes(1);
    expect(proposeArtifact.execute).toHaveBeenNthCalledWith(1, {
      workspaceId: "workspace-a",
      taskId: "01J00000000000000000000000",
      proposal: {
        ...reviewedProposal,
        payload: { ...reviewedProposal.payload, unknowns: [], humanAnswers: answers },
      },
      actor,
      idempotencyKey: `requirement-confirm:proposal:${CONFIRMATION_DIGEST}`,
    });
  });
});

function digestPort() {
  return {
    calculate: () => success(CONFIRMATION_DIGEST),
  };
}

function createProposal(unknowns: readonly string[]) {
  return {
    artifactType: ArtifactType.RequirementContract,
    status: ArtifactStatus.Proposed,
    payload: {
      problem: "问题",
      goals: ["目标"],
      nonGoals: ["非目标"],
      observableBehaviors: ["行为"],
      acceptanceCriteria: ["标准"],
      includedScopes: ["范围"],
      forbiddenScopes: ["禁止范围"],
      repositories: ["repo-a"],
      edgeCases: [],
      compatibilityConstraints: ["兼容"],
      evidence: [
        { evidenceId: "prd", kind: EvidenceKind.File, source: "prd", title: "feature.md" },
      ],
      claims: [],
      unknowns,
      humanAnswers: [],
    },
  };
}
