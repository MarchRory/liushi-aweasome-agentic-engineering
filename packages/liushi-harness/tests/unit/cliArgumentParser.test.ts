import { describe, expect, it } from "vitest";

import { ResultStatus } from "../../src/common/index.js";
import { CliCommand, CliOutputFormat, parseCliArguments } from "../../src/presentation/index.js";

const TASK_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const ARTIFACT_ID = "01ARZ3NDEKTSV4RRFFQ69G5FB0";

describe("CLI argument parser", () => {
  it("严格解析 profile compile 的独立 artifact 与 report 选项", () => {
    const result = parseCliArguments([
      "profile",
      "compile",
      "--workspace",
      "workspace-profile",
      "--task",
      TASK_ID,
      "--artifact",
      ARTIFACT_ID,
      "--report",
      "report.json",
      "--store",
      ".runtime",
      "--json",
    ]);

    expect(result).toEqual({
      status: ResultStatus.Success,
      value: {
        command: CliCommand.ProfileCompile,
        outputFormat: CliOutputFormat.Json,
        storeRoot: ".runtime",
        workspaceId: "workspace-profile",
        taskId: TASK_ID,
        artifactId: ARTIFACT_ID,
        reportFilePath: "report.json",
      },
    });
  });

  it.each([
    ["--artifact", ["--report", "report.json"]],
    ["--report", ["--artifact", ARTIFACT_ID]],
  ])("缺少 %s 时 fail closed", (missingOption, suppliedOptions) => {
    const result = parseCliArguments([
      "profile",
      "compile",
      "--workspace",
      "workspace-profile",
      "--task",
      TASK_ID,
      ...suppliedOptions,
    ]);

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Failure) {
      expect(result.error.details).toEqual({ option: missingOption });
    }
  });

  it("拒绝以含糊的 --file 代替 --artifact 或 --report", () => {
    const result = parseCliArguments([
      "profile",
      "compile",
      "--workspace",
      "workspace-profile",
      "--task",
      TASK_ID,
      "--artifact",
      ARTIFACT_ID,
      "--report",
      "report.json",
      "--file",
      "ambiguous.json",
    ]);

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Failure) {
      expect(result.error.details).toEqual({ option: "--file" });
    }
  });
});
