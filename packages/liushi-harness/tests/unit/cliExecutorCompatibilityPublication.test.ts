import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  EXECUTOR_COMPATIBILITY_PUBLICATION_WRITE_RESULT_SCHEMA_VERSION,
  ExecutorCompatibilityPublicationWriteDisposition,
} from "../../src/application/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  parseContentDigest,
  success,
} from "../../src/common/index.js";
import {
  CLI_EXIT_CODE_CONFLICT,
  CLI_EXIT_CODE_OUTCOME_UNKNOWN,
  CLI_EXIT_CODE_SUCCESS,
  CliCommand,
  CliOutputFormat,
  CliResponseStatus,
  parseCliArguments,
  runCli,
  type CliApplication,
  type ExecutorCompatibilityBundleCreateCliCommand,
  type RunCliDependencies,
} from "../../src/presentation/index.js";

const matrixDigest = mustParseContentDigest(`sha256:${"a".repeat(64)}`);
const packageDigest = mustParseContentDigest(`sha256:${"b".repeat(64)}`);
const outputFilePath = resolve(".tmp", "executorCompatibilityBundle.json");
const bundleArguments = [
  "executor",
  "compatibility",
  "bundle",
  "create",
  "--matrix-digest",
  matrixDigest,
  "--package-name",
  "liushi-harness",
  "--package-version",
  "1.2.3",
  "--package-digest",
  packageDigest,
  "--repository-uri",
  "https://github.com/MarchRory/liushi-aweasome-agentic-engineering",
  "--source-revision",
  "c".repeat(40),
  "--output",
  outputFilePath,
] as const;
const writeResult = {
  schemaVersion: EXECUTOR_COMPATIBILITY_PUBLICATION_WRITE_RESULT_SCHEMA_VERSION,
  disposition: ExecutorCompatibilityPublicationWriteDisposition.Created,
  outputFilePath,
  bundleDigest: `sha256:${"d".repeat(64)}`,
  matrixDigest,
  packageDigest,
  packageName: "liushi-harness",
  packageVersion: "1.2.3",
  byteLength: 4096,
} as const;

describe("Executor Compatibility Publication CLI", () => {
  it("解析完整 bundle create 参数并规范化绝对输出路径", () => {
    const parsed = parseCliArguments([...bundleArguments, "--store", ".runtime", "--json"]);

    expect(parsed.status).toBe(ResultStatus.Success);
    if (parsed.status === ResultStatus.Failure) throw parsed.error;
    expect(parsed.value).toEqual({
      command: CliCommand.ExecutorCompatibilityBundleCreate,
      outputFormat: CliOutputFormat.Json,
      storeRoot: ".runtime",
      matrixDigest,
      packageName: "liushi-harness",
      packageVersion: "1.2.3",
      packageDigest,
      repositoryUri: "https://github.com/MarchRory/liushi-aweasome-agentic-engineering",
      sourceRevision: "c".repeat(40),
      outputFilePath,
    } satisfies ExecutorCompatibilityBundleCreateCliCommand);
  });

  it.each([
    ["--matrix-digest", "sha256:ABC"],
    ["--package-digest", "sha256:ABC"],
    ["--output", "relative.json"],
  ] as const)("拒绝非法必需选项 %s", (option, value) => {
    const parsed = parseCliArguments(replaceOption(bundleArguments, option, value));

    expect(parsed).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.InvalidInput, details: { option } },
    });
  });

  it("JSON 模式仅输出稳定写入回执并传递精确创建输入", async () => {
    const setup = createSetup();

    const exitCode = await runCli(
      [...bundleArguments, "--store", ".custom", "--json"],
      setup.dependencies,
    );

    expect(exitCode).toBe(CLI_EXIT_CODE_SUCCESS);
    expect(setup.createApplication).toHaveBeenCalledWith(".custom");
    expect(setup.publishExecute).toHaveBeenCalledWith({
      matrixDigest,
      releaseSubject: {
        packageName: "liushi-harness",
        packageVersion: "1.2.3",
        packageDigest,
        repositoryUri: "https://github.com/MarchRory/liushi-aweasome-agentic-engineering",
        sourceRevision: "c".repeat(40),
      },
      outputFilePath,
    });
    expect(JSON.parse(setup.stdout)).toMatchObject({
      status: CliResponseStatus.Success,
      command: CliCommand.ExecutorCompatibilityBundleCreate,
      data: writeResult,
    });
    expect(setup.stdout).not.toContain("projections");
    expect(setup.stderr).toBe("");
  });

  it("Human 模式输出单行脱敏回执摘要", async () => {
    const setup = createSetup();

    const exitCode = await runCli(bundleArguments, setup.dependencies);

    expect(exitCode).toBe(CLI_EXIT_CODE_SUCCESS);
    expect(setup.stdout).toBe(
      `Executor compatibility bundle ${writeResult.bundleDigest}: matrix=${matrixDigest} package=liushi-harness@1.2.3 tarball=${packageDigest} disposition=created bytes=4096 output=${outputFilePath}.\n`,
    );
  });

  it("既有不同文件映射为稳定 Conflict 且不输出成功回执", async () => {
    const setup = createSetup();
    setup.publishExecute.mockResolvedValueOnce(
      failure(new HarnessError(HarnessErrorCode.PreconditionNotMet, "output conflict")),
    );

    const exitCode = await runCli(bundleArguments, setup.dependencies);

    expect(exitCode).toBe(CLI_EXIT_CODE_CONFLICT);
    expect(setup.stdout).toBe("");
    expect(setup.stderr).toContain(HarnessErrorCode.PreconditionNotMet);
  });

  it("发布已开始后的耐久失败映射为禁止自动重试退出码", async () => {
    const setup = createSetup();
    setup.publishExecute.mockResolvedValueOnce(
      failure(
        new HarnessError(
          HarnessErrorCode.ExecutorCompatibilityPublicationCommitOutcomeUnknown,
          "publication outcome unknown",
        ),
      ),
    );

    const exitCode = await runCli([...bundleArguments, "--json"], setup.dependencies);

    expect(exitCode).toBe(CLI_EXIT_CODE_OUTCOME_UNKNOWN);
    expect(JSON.parse(setup.stderr)).toMatchObject({
      status: CliResponseStatus.Failure,
      command: CliCommand.ExecutorCompatibilityBundleCreate,
      error: {
        code: HarnessErrorCode.ExecutorCompatibilityPublicationCommitOutcomeUnknown,
      },
    });
  });
});

function createSetup() {
  let stdout = "";
  let stderr = "";
  const publishExecute = vi.fn().mockResolvedValue(success(writeResult));
  const application = {
    publishExecutorCompatibilityPublicationBundle: { execute: publishExecute },
  } as unknown as CliApplication;
  const createApplication = vi.fn(() => application);
  const dependencies: RunCliDependencies = {
    defaultStoreRoot: ".runtime",
    applicationFactory: { create: createApplication },
    writer: {
      stdout: (value) => {
        stdout += value;
      },
      stderr: (value) => {
        stderr += value;
      },
    },
    jsonDocumentReader: {
      read: () => Promise.resolve(success({})),
    },
  };
  return {
    dependencies,
    publishExecute,
    createApplication,
    get stdout() {
      return stdout;
    },
    get stderr() {
      return stderr;
    },
  };
}

function replaceOption(args: readonly string[], option: string, value: string): string[] {
  const replaced = [...args];
  const index = replaced.indexOf(option);
  replaced[index + 1] = value;
  return replaced;
}

function mustParseContentDigest(value: string) {
  const parsed = parseContentDigest(value);
  if (parsed.status === ResultStatus.Failure) throw parsed.error;
  return parsed.value;
}
