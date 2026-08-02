import { access, readFile, writeFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { HarnessErrorCode, ResultStatus, success } from "../../src/index.js";
import { ArtifactStatus, ArtifactType } from "../../src/domain/artifact/enums/index.js";
import { EvidenceKind } from "../../src/domain/evidence/index.js";
import { CodexRequirementAnalysisAgentAdapter } from "../../src/infrastructure/executors/codex/requirementAnalysis/index.js";
import { parseRequirementAnalysisOutput } from "../../src/infrastructure/executors/codex/requirementAnalysis/requirementAnalysisOutput.schema.js";
import type { CommandRunner } from "../../src/infrastructure/system/commandRunner/commandRunner.contracts.js";

const validProposal = {
  artifactType: ArtifactType.RequirementContract,
  status: ArtifactStatus.Proposed,
  payload: {
    problem: "需要分析需求。",
    goals: [],
    nonGoals: [],
    observableBehaviors: [],
    acceptanceCriteria: [],
    includedScopes: [],
    forbiddenScopes: [],
    repositories: [],
    edgeCases: [],
    compatibilityConstraints: [],
    evidence: [],
    claims: [],
    unknowns: [],
    humanAnswers: [],
  },
};

describe("Codex Requirement Analysis Agent", () => {
  it("以只读参数和 stdin 调用 Codex，并返回未复验的 JSON", async () => {
    let request: Parameters<CommandRunner["run"]>[0] | undefined;
    let outputSchema: unknown;
    const commandRunner: CommandRunner = {
      run: async (value) => {
        request = value;
        outputSchema = JSON.parse(
          await readFile(getArgumentAfter(value.args, "--output-schema"), "utf8"),
        ) as unknown;
        const outputPath = getArgumentAfter(value.args, "--output-last-message");
        await writeFile(outputPath, JSON.stringify(validProposal), "utf8");
        return success({ exitCode: 0, stdout: "不应被读取", stderr: "" });
      },
    };

    const result = await new CodexRequirementAnalysisAgentAdapter(
      "codex",
      "gpt-test",
      commandRunner,
    ).analyze({
      repositoryId: "repo-1",
      repositoryRoot: "C:\\repo",
      prdSource: "prd.md",
      prdContent: "PRD 私密正文",
    });

    expect(result.status).toBe(ResultStatus.Success);
    expect(request?.executable).toBe("codex");
    expect(request?.stdin).toContain("PRD 私密正文");
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
    expect(asRecord(outputSchema)).not.toHaveProperty("$schema");
    assertEveryObjectPropertyIsRequired(outputSchema);
    if (request === undefined) return;
    await expect(access(getArgumentAfter(request.args, "--output-schema"))).rejects.toThrow();
    await expect(access(getArgumentAfter(request.args, "--output-last-message"))).rejects.toThrow();
  });

  it.each([
    ["非零退出", success({ exitCode: 2, stdout: "敏感 stdout", stderr: "敏感 stderr" })],
    ["非法 JSON", success({ exitCode: 0, stdout: "", stderr: "" })],
    ["输出缺失", success({ exitCode: 0, stdout: "", stderr: "" })],
  ])("将 %s 转为 HarnessError 且不泄露命令输出", async (name, commandResult) => {
    const commandRunner: CommandRunner = {
      run: async (value) => {
        if (name === "非法 JSON") {
          const outputPath = getArgumentAfter(value.args, "--output-last-message");
          await writeFile(outputPath, "not-json", "utf8");
        }
        return commandResult;
      },
    };

    const result = await new CodexRequirementAnalysisAgentAdapter(
      "codex",
      "gpt-test",
      commandRunner,
    ).analyze({
      repositoryId: "repo-1",
      repositoryRoot: "C:\\repo",
      prdSource: "prd.md",
      prdContent: "PRD 私密正文",
    });

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Success) return;
    expect(result.error.code).toBe(HarnessErrorCode.IoFailure);
    expect(result.error.message).not.toContain("敏感");
    expect(result.error.message).not.toContain("PRD");
    expect(JSON.stringify(result.error.details)).not.toContain("敏感");
  });

  it("将输出 Schema 拒绝分类为稳定诊断且不暴露 stderr", async () => {
    const commandRunner: CommandRunner = {
      run: () =>
        Promise.resolve(
          success({
            exitCode: 1,
            stdout: "",
            stderr: "Invalid schema for response_format: 敏感上下文",
          }),
        ),
    };

    const result = await new CodexRequirementAnalysisAgentAdapter(
      "codex",
      "gpt-test",
      commandRunner,
    ).analyze({
      repositoryId: "repo-1",
      repositoryRoot: "C:\\repo",
      prdSource: "prd.md",
      prdContent: "PRD 私密正文",
    });

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Success) return;
    expect(result.error.details).toEqual({
      failureKind: "output_schema_rejected",
      exitCode: "1",
    });
    expect(JSON.stringify(result.error)).not.toContain("敏感上下文");
  });

  it("将 Codex 线格式中的 null Evidence 字段还原为领域可选字段", () => {
    const parsed = parseRequirementAnalysisOutput({
      ...validProposal,
      payload: {
        ...validProposal.payload,
        evidence: [
          {
            evidenceId: "evidence-1",
            kind: EvidenceKind.File,
            source: "repository",
            title: "状态定义",
            locator: "src/accessState.ts",
            revision: null,
            observedAt: null,
            contentDigest: null,
          },
        ],
      },
    });

    expect(parsed?.payload.evidence[0]?.evidenceId).toBe("evidence-1");
    expect(parsed?.payload.evidence[0]?.locator).toBe("src/accessState.ts");
    expect(parsed?.payload.evidence[0]).not.toHaveProperty("revision");
  });
});

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
  if (!isRecord(value)) throw new Error("预期为 JSON Schema 对象。");
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
