import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { ResultStatus } from "../../src/common/index.js";
import { InstallationTarget } from "../../src/domain/index.js";
import {
  CLI_USAGE_LINES,
  CliCommand,
  CliOutputFormat,
  CliVerificationMode,
  parseCliArguments,
} from "../../src/presentation/index.js";

const TASK_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const ARTIFACT_ID = "01ARZ3NDEKTSV4RRFFQ69G5FB0";

describe("CLI argument parser", () => {
  it("严格解析 init --dry-run 的受管文件参数", () => {
    const root = resolve("repository");
    expect(
      parseCliArguments([
        "init",
        "--target",
        "codex",
        "--root",
        root,
        "--workspace",
        "workspace-1",
        "--repository",
        "repository-1",
        "--dry-run",
        "--json",
      ]),
    ).toMatchObject({
      status: ResultStatus.Success,
      value: {
        command: CliCommand.InitDryRun,
        target: InstallationTarget.Codex,
        root,
        workspaceId: "workspace-1",
        repositoryId: "repository-1",
        dryRun: true,
      },
    });
  });

  it("拒绝省略 init --dry-run", () => {
    expect(
      parseCliArguments([
        "init",
        "--target",
        "codex",
        "--root",
        resolve("repository"),
        "--workspace",
        "workspace-1",
        "--repository",
        "repository-1",
      ]).status,
    ).toBe(ResultStatus.Failure);
  });
  it("严格解析 cell run 的 file、store 与 JSON 选项", () => {
    const repositoryRoot = resolve("repository");
    expect(
      parseCliArguments([
        "cell",
        "run",
        "--file",
        "cell.json",
        "--workspace",
        "workspace-1",
        "--repository",
        "repository-1",
        "--root",
        repositoryRoot,
        "--verification-mode",
        "local_command",
        "--store",
        ".runtime",
        "--json",
      ]),
    ).toEqual({
      status: ResultStatus.Success,
      value: {
        command: CliCommand.CellRun,
        outputFormat: CliOutputFormat.Json,
        storeRoot: ".runtime",
        filePath: "cell.json",
        workspaceId: "workspace-1",
        repositoryId: "repository-1",
        repositoryRoot,
        verificationMode: CliVerificationMode.LocalCommand,
      },
    });
  });

  it("cell run 缺少 file 时 fail closed", () => {
    expect(parseCliArguments(["cell", "run"]).status).toBe(ResultStatus.Failure);
  });

  it.each(["--workspace", "--repository", "--root", "--verification-mode"])(
    "cell run 缺少 %s 时 fail closed",
    (missingOption) => {
      const options = new Map([
        ["--workspace", "workspace-1"],
        ["--repository", "repository-1"],
        ["--root", resolve("repository")],
        ["--verification-mode", "fail_closed_mock"],
      ]);
      options.delete(missingOption);
      const args = ["cell", "run", "--file", "cell.json"];
      for (const [option, value] of options) args.push(option, value);

      const result = parseCliArguments(args);

      expect(result.status).toBe(ResultStatus.Failure);
      if (result.status === ResultStatus.Failure) {
        expect(result.error.details).toEqual({ option: missingOption });
      }
    },
  );

  it("cell run 拒绝未知 verification mode", () => {
    const result = parseCliArguments([
      "cell",
      "run",
      "--file",
      "cell.json",
      "--workspace",
      "workspace-1",
      "--repository",
      "repository-1",
      "--root",
      resolve("repository"),
      "--verification-mode",
      "automatic",
    ]);

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Failure) {
      expect(result.error.details).toEqual({ verificationMode: "automatic" });
    }
  });

  it("cell run 拒绝非绝对 root", () => {
    const result = parseCliArguments([
      "cell",
      "run",
      "--file",
      "cell.json",
      "--workspace",
      "workspace-1",
      "--repository",
      "repository-1",
      "--root",
      "repository",
      "--verification-mode",
      "fail_closed_mock",
    ]);

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Failure) {
      expect(result.error.details).toEqual({ option: "--root" });
    }
  });

  it("Help 包含单一 Cell 命令入口", () => {
    expect(CLI_USAGE_LINES).toContain(
      "liushi-harness cell run --file <manifest.json> --workspace <id> --repository <id> --root <absolute-path> --verification-mode <fail_closed_mock|local_command> [--store <path>] [--json]",
    );
  });

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
