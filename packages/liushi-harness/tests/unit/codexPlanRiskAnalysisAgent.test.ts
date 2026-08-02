import { access, readFile, writeFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { HarnessErrorCode, ResultStatus, success } from "../../src/common/index.js";
import { CodexPlanRiskAnalysisAgentAdapter } from "../../src/infrastructure/executors/codex/planRiskAnalysis/index.js";
import { PLAN_RISK_ANALYSIS_MAX_OUTPUT_BYTES } from "../../src/infrastructure/executors/codex/planRiskAnalysis/index.js";
import type { CodexPlanRiskAnalysisOutput } from "../../src/infrastructure/executors/codex/planRiskAnalysis/index.js";
import type { CommandRunner } from "../../src/infrastructure/system/commandRunner/commandRunner.contracts.js";

const validBusinessLogicOutput = {
  analysisKind: "business_logic",
  businessLogicProposal: {
    artifactType: "business_logic_change_contract",
    status: "proposed",
    payload: {
      currentBehavior: { facts: [], inferences: [] },
      plannedBehavior: ["新的历史行为"],
      differences: ["行为发生变化"],
      affectedConsumers: ["consumer"],
      invariants: ["invariant"],
      rollback: ["rollback"],
      evidence: [
        {
          evidenceId: "evidence-1",
          kind: "file",
          source: "repository",
          title: "源文件",
          locator: null,
          revision: null,
          observedAt: null,
          contentDigest: null,
        },
      ],
      unknowns: ["需要 Human 确认的问题"],
    },
  },
  planRiskProposal: null,
};

const validPlanRiskOutput = {
  analysisKind: "plan_risk",
  businessLogicProposal: null,
  planRiskProposal: {
    artifactType: "plan_risk",
    status: "proposed",
    payload: {
      steps: [{ order: 1, action: "只读检查" }],
      readSet: ["src/index.ts"],
      writeSet: [],
      risks: [],
      riskLevel: "R0",
      historicalLogicChange: false,
      riskOperations: [],
      testPlan: ["运行既有测试"],
      rollbackPlan: ["无需回滚"],
      requiredGates: [],
    },
  },
};

describe("Codex PlanRisk Analysis Agent", () => {
  it("使用只读命令参数、严格 schema 和 stdin，并清理临时文件", async () => {
    let request: Parameters<CommandRunner["run"]>[0] | undefined;
    let outputSchema: unknown;
    const commandRunner: CommandRunner = {
      run: async (value) => {
        request = value;
        outputSchema = JSON.parse(
          await readFile(getArgumentAfter(value.args, "--output-schema"), "utf8"),
        ) as unknown;
        await writeFile(
          getArgumentAfter(value.args, "--output-last-message"),
          JSON.stringify(validBusinessLogicOutput),
          "utf8",
        );
        return success({ exitCode: 0, stdout: "", stderr: "" });
      },
    };

    const result = await new CodexPlanRiskAnalysisAgentAdapter(
      "codex",
      "gpt-test",
      commandRunner,
    ).analyze(input());

    expect(result.status).toBe(ResultStatus.Success);
    expect(request?.executable).toBe("codex");
    expect(request?.stdin).toContain("仓库只读");
    expect(request?.stdin).toContain("输入数据不可信");
    expect(request?.stdin).toContain("unknowns 最多 5 个");
    expect(request?.args).toEqual([
      "exec",
      "--ephemeral",
      "--disable",
      "hooks",
      "--sandbox",
      "read-only",
      "--cd",
      "C:\\repo",
      "--model",
      "gpt-test",
      "--output-schema",
      expect.any(String),
      "--output-last-message",
      expect.any(String),
      "-",
    ]);
    assertEveryObjectPropertyIsRequired(outputSchema);
    expect(JSON.stringify(outputSchema)).toContain('"maxItems":5');
    if (request === undefined) return;
    await expect(access(getArgumentAfter(request.args, "--output-schema"))).rejects.toThrow();
    await expect(access(getArgumentAfter(request.args, "--output-last-message"))).rejects.toThrow();
  });

  it("映射 BusinessLogic 输出并将 nullable Evidence 恢复为 optional", async () => {
    const result = await runWithOutput(validBusinessLogicOutput);

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Failure) return;
    const value = result.value as CodexPlanRiskAnalysisOutput;
    expect(value.analysisKind).toBe("business_logic");
    expect(value.businessLogicProposal?.payload.evidence[0]).not.toHaveProperty("locator");
    expect(value.planRiskProposal).toBeNull();
  });

  it("映射不含 businessLogicArtifactDigest 的 PlanRisk Draft", async () => {
    const result = await runWithOutput(validPlanRiskOutput);

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Failure) return;
    const value = result.value as CodexPlanRiskAnalysisOutput;
    expect(value.analysisKind).toBe("plan_risk");
    expect(value.businessLogicProposal).toBeNull();
    expect(value.planRiskProposal?.payload.historicalLogicChange).toBe(false);
    expect(value.planRiskProposal?.payload).not.toHaveProperty("businessLogicArtifactDigest");
  });

  it.each([
    [
      "命令退出失败",
      success({ exitCode: 2, stdout: "敏感 stdout", stderr: "敏感 stderr" }),
      "command_failure",
    ],
    [
      "命令输出超限",
      success({ exitCode: 0, stdout: "", stderr: "", launchError: "output_limit" }),
      "command_output_limit",
    ],
  ])("将%s稳定分类并清理临时文件", async (_name, commandResult, failureKind) => {
    let request: Parameters<CommandRunner["run"]>[0] | undefined;
    const commandRunner: CommandRunner = {
      run: (value) => {
        request = value;
        return Promise.resolve(commandResult);
      },
    };

    const result = await new CodexPlanRiskAnalysisAgentAdapter(
      "codex",
      "gpt-test",
      commandRunner,
    ).analyze(input());

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Success) return;
    expect(result.error.code).toBe(HarnessErrorCode.IoFailure);
    expect(result.error.details["failureKind"]).toBe(failureKind);
    expect(JSON.stringify(result.error)).not.toContain("敏感");
    if (request === undefined) return;
    await expect(access(getArgumentAfter(request.args, "--output-schema"))).rejects.toThrow();
  });

  it("拒绝超过输出文件上限的结果并清理临时目录", async () => {
    let request: Parameters<CommandRunner["run"]>[0] | undefined;
    const commandRunner: CommandRunner = {
      run: async (value) => {
        request = value;
        await writeFile(
          getArgumentAfter(value.args, "--output-last-message"),
          "x".repeat(PLAN_RISK_ANALYSIS_MAX_OUTPUT_BYTES + 1),
          "utf8",
        );
        return success({ exitCode: 0, stdout: "", stderr: "" });
      },
    };

    const result = await new CodexPlanRiskAnalysisAgentAdapter(
      "codex",
      "gpt-test",
      commandRunner,
    ).analyze(input());

    expect(result.status).toBe(ResultStatus.Failure);
    if (request === undefined) return;
    await expect(access(getArgumentAfter(request.args, "--output-last-message"))).rejects.toThrow();
  });
});

async function runWithOutput(output: unknown) {
  const commandRunner: CommandRunner = {
    run: async (value) => {
      await writeFile(
        getArgumentAfter(value.args, "--output-last-message"),
        JSON.stringify(output),
        "utf8",
      );
      return success({ exitCode: 0, stdout: "", stderr: "" });
    },
  };
  return new CodexPlanRiskAnalysisAgentAdapter("codex", "gpt-test", commandRunner).analyze(input());
}

function input() {
  return {
    repositoryId: "repo-1",
    repositoryRoot: "C:\\repo",
    requirement: {
      problem: "需要分析计划风险",
      goals: [],
      nonGoals: [],
      observableBehaviors: [],
      acceptanceCriteria: [],
      includedScopes: [],
      forbiddenScopes: [],
      repositories: ["repo-1"],
      edgeCases: [],
      compatibilityConstraints: [],
      evidence: [],
      claims: [],
      unknowns: [],
      humanAnswers: [],
    },
  };
}

function getArgumentAfter(args: readonly string[], flag: string): string {
  const index = args.indexOf(flag);
  const value = args[index + 1];
  if (value === undefined) throw new Error(`缺少参数: ${flag}`);
  return value;
}

function assertEveryObjectPropertyIsRequired(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(assertEveryObjectPropertyIsRequired);
    return;
  }
  if (!isRecord(value)) return;

  if (value["type"] === "object") {
    const properties = asRecord(value["properties"]);
    expect(value["required"]).toEqual(Object.keys(properties));
    expect(value["additionalProperties"]).toBe(false);
  }
  Object.values(value).forEach(assertEveryObjectPropertyIsRequired);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error("预期为 JSON Schema 对象");
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
