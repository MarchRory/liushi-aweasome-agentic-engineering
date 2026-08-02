import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { success } from "../../src/common/index.js";
import {
  ArtifactStatus,
  ArtifactType,
  EvidenceKind,
  type RequirementContractProposal,
} from "../../src/domain/index.js";
import {
  CliApplicationBindingScope,
  CliCommand,
  runCli,
  type CliApplication,
  type CliWriter,
  type RunCliDependencies,
} from "../../src/presentation/index.js";

describe("requirement analyze CLI", () => {
  it("解析显式模型并输出不含 Digest 的语义结果", async () => {
    const execute = vi.fn(() =>
      Promise.resolve(
        success({
          workspaceId: "workspace-a",
          repositoryId: "repo-a",
          proposal: createProposal(["空状态文案由谁确认？"]),
          analysisStatus: "human_battle_required",
          humanQuestions: ["空状态文案由谁确认？"],
          reviewDraft: {
            proposal: createProposal(["空状态文案由谁确认？"]),
            answers: [{ question: "空状态文案由谁确认？", answer: "" }],
          },
        }),
      ),
    );
    const create = vi.fn(() => ({ analyzeRequirement: { execute } }) as unknown as CliApplication);
    const output = createOutput();
    const prdPath = resolve("feature.md");
    const repositoryRoot = resolve("repository");

    const exitCode = await runCli(
      [
        "requirement",
        "analyze",
        "--prd",
        prdPath,
        "--workspace",
        "workspace-a",
        "--repository",
        "repo-a",
        "--root",
        repositoryRoot,
        "--model",
        "frontier-model",
        "--executable",
        "codex-test",
        "--json",
      ],
      createDependencies(create, output.writer),
    );

    expect(exitCode).toBe(0);
    expect(create).toHaveBeenCalledWith(expect.any(String), {
      scope: CliApplicationBindingScope.RequirementAnalysis,
      repositoryBinding: {
        workspaceId: "workspace-a",
        repositoryId: "repo-a",
        repositoryRoot,
      },
      executable: "codex-test",
      model: "frontier-model",
    });
    expect(execute).toHaveBeenCalledWith({
      workspaceId: "workspace-a",
      repositoryId: "repo-a",
      repositoryRoot,
      prdSource: "feature.md",
      prdContent: "PRD content",
    });
    expect(output.stderr).toEqual([]);
    const envelope = JSON.parse(output.stdout.join("")) as Record<string, unknown>;
    expect(envelope["command"]).toBe(CliCommand.RequirementAnalyze);
    expect(output.stdout.join("")).not.toContain("sha256:");
    expect(output.stdout.join("")).not.toContain("stateDigest");
  });

  it("Human 输出直接展示问题、目标、验收标准和待确认问题", async () => {
    const output = createOutput();
    const application = {
      analyzeRequirement: {
        execute: () =>
          Promise.resolve(
            success({
              workspaceId: "workspace-a",
              repositoryId: "repo-a",
              proposal: createProposal(["是否保留旧入口？"]),
              analysisStatus: "human_battle_required",
              humanQuestions: ["是否保留旧入口？"],
            }),
          ),
      },
    } as unknown as CliApplication;

    const exitCode = await runCli(
      [
        "requirement",
        "analyze",
        "--prd",
        resolve("feature.md"),
        "--workspace",
        "workspace-a",
        "--repository",
        "repo-a",
        "--root",
        resolve("repository"),
        "--model",
        "frontier-model",
      ],
      createDependencies(
        vi.fn(() => application),
        output.writer,
      ),
    );

    expect(exitCode).toBe(0);
    expect(output.stdout.join("")).toContain("Problem: 用户无法识别当前状态。");
    expect(output.stdout.join("")).toContain("- 展示明确状态");
    expect(output.stdout.join("")).toContain("- 状态文案与实际状态一致");
    expect(output.stdout.join("")).toContain("- 是否保留旧入口？");
  });
  it("从 analyze JSON 的 data.proposal 和 data.reviewDraft 执行 confirm", async () => {
    const output = createOutput();
    const reviewDocument = {
      data: {
        proposal: createProposal(["是否保留旧入口？"]),
        reviewDraft: {
          proposal: createProposal(["是否保留旧入口？"]),
          answers: [{ question: "是否保留旧入口？", answer: "保留" }],
        },
      },
    };
    const executeConfirm = vi.fn(() =>
      Promise.resolve(
        success({
          confirmationStatus: "confirmed",
          nextStep: "plan_risk",
          task: { taskId: "task-a" },
          artifact: { artifactId: "artifact-a" },
        }),
      ),
    );
    const application = {
      confirmRequirement: { execute: executeConfirm },
    } as unknown as CliApplication;
    const exitCode = await runCli(
      [
        "requirement",
        "confirm",
        "--file",
        resolve("analysis.json"),
        "--workspace",
        "workspace-a",
        "--task",
        "task-a",
        "--repository",
        "repo-a",
        "--actor-id",
        "human-a",
        "--json",
      ],
      {
        ...createDependencies(
          vi.fn(() => application),
          output.writer,
        ),
        jsonDocumentReader: { read: () => Promise.resolve(success(reviewDocument)) },
      },
    );

    expect(exitCode).toBe(0);
    expect(executeConfirm).toHaveBeenCalledWith({
      workspaceId: "workspace-a",
      taskId: "task-a",
      repositoryId: "repo-a",
      analysisProposal: reviewDocument.data.proposal,
      review: reviewDocument.data.reviewDraft,
      actor: { kind: "human", actorId: "human-a" },
    });
    expect(output.stdout.join("")).not.toContain("digest");
    expect(output.stdout.join("")).not.toContain("sha256:");
  });
});

function createDependencies(
  create: RunCliDependencies["applicationFactory"]["create"],
  writer: CliWriter,
): RunCliDependencies {
  return {
    defaultStoreRoot: resolve("runtime-store"),
    applicationFactory: { create },
    writer,
    jsonDocumentReader: { read: () => Promise.resolve(success({})) },
    textDocumentReader: { read: () => Promise.resolve(success("PRD content")) },
  };
}

function createOutput(): { writer: CliWriter; stdout: string[]; stderr: string[] } {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    writer: {
      stdout: (value) => stdout.push(value),
      stderr: (value) => stderr.push(value),
    },
  };
}

function createProposal(unknowns: readonly string[]): RequirementContractProposal {
  return {
    artifactType: ArtifactType.RequirementContract,
    status: ArtifactStatus.Proposed,
    payload: {
      problem: "用户无法识别当前状态。",
      goals: ["展示明确状态"],
      nonGoals: ["修改状态计算"],
      observableBehaviors: ["用户可以看到当前状态"],
      acceptanceCriteria: ["状态文案与实际状态一致"],
      includedScopes: ["状态组件"],
      forbiddenScopes: ["状态计算逻辑"],
      repositories: ["repo-a"],
      edgeCases: [],
      compatibilityConstraints: ["保留现有行为"],
      evidence: [
        {
          evidenceId: "prd",
          kind: EvidenceKind.File,
          source: "prd",
          title: "feature.md",
        },
      ],
      claims: [],
      unknowns,
      humanAnswers: [],
    },
  };
}
