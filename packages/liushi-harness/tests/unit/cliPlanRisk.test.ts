import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { PlanRiskAnalysisStatus, PlanRiskReviewKind } from "../../src/application/index.js";
import { success } from "../../src/common/index.js";
import { ArtifactStatus, ArtifactType } from "../../src/domain/artifact/index.js";
import { RiskLevel } from "../../src/domain/policy/index.js";
import {
  CliApplicationBindingScope,
  CliCommand,
  runCli,
  type CliApplication,
  type CliWriter,
  type RunCliDependencies,
} from "../../src/presentation/index.js";

describe("plan-risk CLI", () => {
  it("解析显式模型和 Task，并输出无人工 Digest 的 Review", async () => {
    const proposal = planDraft();
    const execute = vi.fn(() =>
      Promise.resolve(
        success({
          workspaceId: "workspace-a",
          taskId: "01J00000000000000000000000",
          repositoryId: "repo-a",
          analysisStatus: PlanRiskAnalysisStatus.PlanRiskReviewRequired,
          proposal,
          humanQuestions: [],
          reviewDraft: { kind: PlanRiskReviewKind.PlanRisk, proposal },
        }),
      ),
    );
    const create = vi.fn(() => ({ analyzePlanRisk: { execute } }) as unknown as CliApplication);
    const output = createOutput();
    const repositoryRoot = resolve("repository");
    const storeRoot = resolve("runtime-store");

    const exitCode = await runCli(
      [
        "plan-risk",
        "analyze",
        "--workspace",
        "workspace-a",
        "--task",
        "01J00000000000000000000000",
        "--repository",
        "repo-a",
        "--root",
        repositoryRoot,
        "--model",
        "frontier-model",
        "--executable",
        "codex-test",
        "--store",
        storeRoot,
        "--json",
      ],
      dependencies(create, output.writer),
    );

    expect(exitCode).toBe(0);
    expect(create).toHaveBeenCalledWith(storeRoot, {
      scope: CliApplicationBindingScope.PlanRiskAnalysis,
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
      taskId: "01J00000000000000000000000",
      repositoryId: "repo-a",
    });
    expect(output.stderr).toEqual([]);
    expect(output.stdout.join("")).toContain(CliCommand.PlanRiskAnalyze);
    expect(output.stdout.join("")).not.toContain("sha256:");
    expect(output.stdout.join("")).not.toContain("stateDigest");
  });

  it("confirm 只输出语义结果和 Artifact ID，不输出内部绑定摘要", async () => {
    const analysisDocument = {
      data: {
        workspaceId: "workspace-a",
        taskId: "01J00000000000000000000000",
        repositoryId: "repo-a",
        analysisStatus: PlanRiskAnalysisStatus.PlanRiskReviewRequired,
        proposal: planDraft(),
        humanQuestions: [],
        reviewDraft: { kind: PlanRiskReviewKind.PlanRisk, proposal: planDraft() },
      },
    };
    const execute = vi.fn(() =>
      Promise.resolve(
        success({
          confirmationStatus: "confirmed",
          artifactType: ArtifactType.PlanRisk,
          nextStep: "coding_task",
          artifact: {
            artifactId: "artifact-plan",
            artifactType: ArtifactType.PlanRisk,
            payload: planDraft().payload,
          },
          task: { taskId: "01J00000000000000000000000" },
        }),
      ),
    );
    const application = { confirmPlanRisk: { execute } } as unknown as CliApplication;
    const output = createOutput();

    const exitCode = await runCli(
      [
        "plan-risk",
        "confirm",
        "--file",
        resolve("analysis.json"),
        "--workspace",
        "workspace-a",
        "--task",
        "01J00000000000000000000000",
        "--repository",
        "repo-a",
        "--actor-id",
        "human-a",
        "--json",
      ],
      {
        ...dependencies(
          vi.fn(() => application),
          output.writer,
        ),
        jsonDocumentReader: { read: () => Promise.resolve(success(analysisDocument)) },
      },
    );

    expect(exitCode).toBe(0);
    expect(execute).toHaveBeenCalledWith({
      workspaceId: "workspace-a",
      taskId: "01J00000000000000000000000",
      repositoryId: "repo-a",
      analysisDocument: analysisDocument.data,
      actor: { kind: "human", actorId: "human-a" },
    });
    const text = output.stdout.join("");
    expect(text).toContain(CliCommand.PlanRiskConfirm);
    expect(text).not.toContain("digest");
    expect(text).not.toContain("sha256:");
    expect(text).not.toContain("stateDigest");
  });
});

function dependencies(
  create: RunCliDependencies["applicationFactory"]["create"],
  writer: CliWriter,
): RunCliDependencies {
  return {
    defaultStoreRoot: resolve("runtime-store"),
    applicationFactory: { create },
    writer,
    jsonDocumentReader: { read: () => Promise.resolve(success({})) },
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

function planDraft() {
  return {
    artifactType: ArtifactType.PlanRisk,
    status: ArtifactStatus.Proposed,
    payload: {
      steps: [{ order: 1, action: "修改状态组件" }],
      readSet: ["src/status.ts"],
      writeSet: ["src/status.ts"],
      risks: [{ description: "状态不一致", mitigation: "增加测试" }],
      riskLevel: RiskLevel.R1,
      historicalLogicChange: false,
      riskOperations: [],
      testPlan: ["运行状态组件单元测试"],
      rollbackPlan: ["回退提交"],
      requiredGates: [],
    },
  };
}
