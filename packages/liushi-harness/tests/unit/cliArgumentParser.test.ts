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
const INSTALL_PLAN_ID = "01ARZ3NDEKTSV4RRFFQ69G5FB1";
const INSTALL_PLAN_DIGEST = `sha256:${"a".repeat(64)}`;
const INIT_APPLY_ARGUMENTS = [
  "init",
  "--apply",
  INSTALL_PLAN_ID,
  "--plan-digest",
  INSTALL_PLAN_DIGEST,
  "--workspace",
  "workspace-1",
  "--repository",
  "repository-1",
  "--actor-id",
  "human-1",
  "--idempotency-key",
  "init-apply-1",
] as const;

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

  it("严格解析 init --apply 的完整批准参数", () => {
    expect(parseCliArguments(INIT_APPLY_ARGUMENTS)).toEqual({
      status: ResultStatus.Success,
      value: {
        command: CliCommand.InitApply,
        outputFormat: CliOutputFormat.Human,
        workspaceId: "workspace-1",
        repositoryId: "repository-1",
        planId: INSTALL_PLAN_ID,
        planDigest: INSTALL_PLAN_DIGEST,
        actorId: "human-1",
        idempotencyKey: "init-apply-1",
      },
    });
  });

  it("拒绝 init 同时指定 dry-run 与 apply", () => {
    const result = parseCliArguments([...INIT_APPLY_ARGUMENTS, "--dry-run"]);

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Failure) {
      expect(result.error.details).toEqual({ option: "--apply" });
    }
  });

  it.each(["--plan-digest", "--workspace", "--repository", "--actor-id", "--idempotency-key"])(
    "init --apply 缺少 %s 时 fail closed",
    (missingOption) => {
      const args = [...INIT_APPLY_ARGUMENTS];
      const optionIndex = args.indexOf(missingOption);
      args.splice(optionIndex, 2);

      const result = parseCliArguments(args);

      expect(result.status).toBe(ResultStatus.Failure);
      if (result.status === ResultStatus.Failure) {
        expect(result.error.details).toEqual({ option: missingOption });
      }
    },
  );

  it.each([
    ["--target", "codex"],
    ["--root", resolve("repository")],
  ])("init --apply 拒绝混入 %s", (option, value) => {
    const result = parseCliArguments([...INIT_APPLY_ARGUMENTS, option, value]);

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Failure) {
      expect(result.error.details).toEqual({ option });
    }
  });

  it("init --apply 拒绝未知选项", () => {
    const result = parseCliArguments([...INIT_APPLY_ARGUMENTS, "--unknown", "value"]);

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Failure) {
      expect(result.error.details).toEqual({ option: "--unknown" });
    }
  });

  it.each([
    ["--apply", INSTALL_PLAN_ID],
    ["--plan-digest", INSTALL_PLAN_DIGEST],
    ["--workspace", "workspace-1"],
    ["--repository", "repository-1"],
    ["--actor-id", "human-1"],
    ["--idempotency-key", "init-apply-1"],
  ])("init --apply 拒绝重复选项 %s", (option, value) => {
    const result = parseCliArguments([...INIT_APPLY_ARGUMENTS, option, value]);

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Failure) {
      expect(result.error.details).toEqual({ option });
    }
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

  it("Artifact Proposal 解析可选稳定幂等键", () => {
    expect(
      parseCliArguments([
        "artifact",
        "propose",
        "--workspace",
        "workspace-profile",
        "--task",
        TASK_ID,
        "--file",
        "proposal.json",
        "--idempotency-key",
        "proposal-g8",
      ]),
    ).toEqual({
      status: ResultStatus.Success,
      value: {
        command: CliCommand.ArtifactPropose,
        outputFormat: CliOutputFormat.Human,
        workspaceId: "workspace-profile",
        taskId: TASK_ID,
        filePath: "proposal.json",
        actorId: "local-human",
        idempotencyKey: "proposal-g8",
      },
    });
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
