import { describe, expect, it, vi } from "vitest";

import { HarnessError, HarnessErrorCode, ResultStatus, failure, success } from "../../src/index.js";
import {
  CLI_EXIT_CODE_IO_FAILURE,
  CLI_EXIT_CODE_NOT_FOUND,
  CLI_EXIT_CODE_OUTCOME_UNKNOWN,
  CLI_EXIT_CODE_SUCCESS,
  CLI_USAGE_LINES,
  CliCommand,
  CliExecutorCompatibilityExecutor,
  CliOutputFormat,
  CliResponseStatus,
  parseCliArguments,
  runCli,
  type CliApplication,
  type JsonDocumentReader,
  type RunCliDependencies,
} from "../../src/presentation/index.js";

const MATRIX_DIGEST = `sha256:${"a".repeat(64)}`;
const EVIDENCE_DIGEST = `sha256:${"b".repeat(64)}`;
const RECORD_DIGEST = `sha256:${"c".repeat(64)}`;
const COMPILE_ARGUMENTS = [
  "executor",
  "compatibility",
  "compile",
  "--executor",
  "codex",
  "--prepare",
  "prepare.json",
  "--activation",
  "activation.json",
  "--result",
  "hostResult.json",
] as const;
const QUERY_ARGUMENTS = [
  "executor",
  "compatibility",
  "query",
  "--matrix-digest",
  MATRIX_DIGEST,
] as const;
const MATRIX = {
  schemaVersion: "1.0.0",
  profileId: "managed-file-mutation-hooks",
  scope: {
    adapterKind: "codex",
    distribution: "codex_cli",
    adapterDigest: RECORD_DIGEST,
    executorVersion: "1.2.3",
    surface: "non_interactive_cli",
    operatingSystem: "windows",
    architecture: "x64",
  },
  policyDigest: RECORD_DIGEST,
  supportLevel: "production",
  tiers: [],
  capabilities: [],
  evidenceDigests: [EVIDENCE_DIGEST, RECORD_DIGEST],
  matrixDigest: MATRIX_DIGEST,
} as const;
const COMPILE_OUTPUT = {
  matrix: MATRIX,
  evidencePersistences: [
    {
      disposition: "persisted",
      artifactDigest: RECORD_DIGEST,
      evidenceDigests: [EVIDENCE_DIGEST],
    },
    {
      disposition: "persisted",
      artifactDigest: EVIDENCE_DIGEST,
      evidenceDigests: [RECORD_DIGEST],
    },
  ],
  matrixPersistence: { disposition: "persisted", matrixDigest: MATRIX_DIGEST },
} as const;
const QUERY_OUTPUT = { matrix: MATRIX, recomputed: true } as const;

describe("Executor Compatibility CLI parser", () => {
  it("严格解析 compile 的三份原始 JSON 输入", () => {
    expect(parseCliArguments([...COMPILE_ARGUMENTS, "--store", ".runtime", "--json"])).toEqual({
      status: ResultStatus.Success,
      value: {
        command: CliCommand.ExecutorCompatibilityCompile,
        outputFormat: CliOutputFormat.Json,
        storeRoot: ".runtime",
        executor: CliExecutorCompatibilityExecutor.Codex,
        prepareFilePath: "prepare.json",
        activationFilePath: "activation.json",
        resultFilePath: "hostResult.json",
      },
    });
  });

  it("严格解析精确 lowercase Matrix Digest query", () => {
    expect(parseCliArguments([...QUERY_ARGUMENTS, "--store", ".runtime", "--json"])).toEqual({
      status: ResultStatus.Success,
      value: {
        command: CliCommand.ExecutorCompatibilityQuery,
        outputFormat: CliOutputFormat.Json,
        storeRoot: ".runtime",
        matrixDigest: MATRIX_DIGEST,
      },
    });
  });

  it.each(["--executor", "--prepare", "--activation", "--result"])(
    "compile 缺少 %s 时 fail closed",
    (option) => {
      const result = parseCliArguments(removeOption(COMPILE_ARGUMENTS, option));

      expect(result.status).toBe(ResultStatus.Failure);
      if (result.status === ResultStatus.Failure) {
        expect(result.error.details).toEqual({ option });
      }
    },
  );

  it.each(["claude", "Claude", "claude_compatible", "catpaw", "unknown"])(
    "compile 拒绝非 Codex executor %s",
    (executor) => {
      const args: string[] = [...COMPILE_ARGUMENTS];
      args[4] = executor;

      const result = parseCliArguments(args);

      expect(result.status).toBe(ResultStatus.Failure);
      if (result.status === ResultStatus.Failure) {
        expect(result.error.details).toEqual({ executor });
      }
    },
  );

  it.each([
    ["--matrix-digest", MATRIX_DIGEST],
    ["--file", "normalizedEvidence.json"],
    ["--catalog", "arbitraryPolicy.json"],
  ])("compile 拒绝多余选项 %s", (option, value) => {
    const result = parseCliArguments([...COMPILE_ARGUMENTS, option, value]);

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Failure) {
      expect(result.error.details).toEqual({ option });
    }
  });

  it.each(["--evidence", "--policy"])("compile 不接受未定义输入选项 %s", (option) => {
    const result = parseCliArguments([...COMPILE_ARGUMENTS, option, "input.json"]);

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Failure) {
      expect(result.error.details).toEqual({ option });
    }
  });

  it("compile 拒绝重复选项", () => {
    const result = parseCliArguments([...COMPILE_ARGUMENTS, "--prepare", "second.json"]);

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Failure) {
      expect(result.error.details).toEqual({ option: "--prepare" });
    }
  });

  it("compile 拒绝额外位置参数", () => {
    expect(parseCliArguments([...COMPILE_ARGUMENTS, "extra"]).status).toBe(ResultStatus.Failure);
  });

  it("query 缺少 digest 时 fail closed", () => {
    const result = parseCliArguments(["executor", "compatibility", "query"]);

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Failure) {
      expect(result.error.details).toEqual({ option: "--matrix-digest" });
    }
  });

  it.each([
    `sha256:${"A".repeat(64)}`,
    `sha256:${"a".repeat(63)}`,
    "a".repeat(64),
    `SHA256:${"a".repeat(64)}`,
  ])("query 拒绝非法 digest %s", (digest) => {
    const result = parseCliArguments([
      "executor",
      "compatibility",
      "query",
      "--matrix-digest",
      digest,
    ]);

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Failure) {
      expect(result.error.details).toEqual({ option: "--matrix-digest" });
    }
  });

  it("query 拒绝多余选项", () => {
    const result = parseCliArguments([...QUERY_ARGUMENTS, "--executor", "codex"]);

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Failure) {
      expect(result.error.details).toEqual({ option: "--executor" });
    }
  });

  it("Help 包含两条真实 Executor Compatibility 命令", () => {
    expect(CLI_USAGE_LINES).toEqual(
      expect.arrayContaining([
        "liushi-harness executor compatibility compile --executor codex --prepare <prepare.json> --activation <activation.json> --result <hostResult.json> [--store <path>] [--json]",
        "liushi-harness executor compatibility query --matrix-digest <sha256:64hex> [--store <path>] [--json]",
      ]),
    );
  });
});

describe("Executor Compatibility CLI runner", () => {
  it.each([0, 1, 2])("第 %i 份 JSON 读取失败时短路且不创建 Application", async (failedIndex) => {
    let index = 0;
    const setup = createSetup({
      read: () => {
        const current = index;
        index += 1;
        return Promise.resolve(
          current === failedIndex
            ? failure(new HarnessError(HarnessErrorCode.IoFailure, "read failed"))
            : success({ current }),
        );
      },
    });

    const exitCode = await runCli(COMPILE_ARGUMENTS, setup.dependencies);

    expect(exitCode).toBe(CLI_EXIT_CODE_IO_FAILURE);
    expect(setup.read).toHaveBeenCalledTimes(failedIndex + 1);
    expect(setup.createApplication).not.toHaveBeenCalled();
    expect(setup.compileExecute).not.toHaveBeenCalled();
  });

  it("compile 成功时按顺序读取 raw JSON 并输出稳定 JSON Envelope", async () => {
    const setup = createSetup();

    const exitCode = await runCli(
      [...COMPILE_ARGUMENTS, "--store", ".custom", "--json"],
      setup.dependencies,
    );

    expect(exitCode).toBe(CLI_EXIT_CODE_SUCCESS);
    expect(setup.read.mock.calls.map(([filePath]) => filePath)).toEqual([
      "prepare.json",
      "activation.json",
      "hostResult.json",
    ]);
    expect(setup.createApplication).toHaveBeenCalledWith(".custom");
    expect(setup.compileExecute).toHaveBeenCalledWith({
      prepareManifest: { prepareSecret: "prepare-secret" },
      activationPlan: { activationSecret: "activation-secret" },
      hostResult: { hostSecret: "host-secret" },
    });
    expect(JSON.parse(setup.stdout)).toMatchObject({
      status: CliResponseStatus.Success,
      command: CliCommand.ExecutorCompatibilityCompile,
      data: COMPILE_OUTPUT,
    });
    expect(setup.stdout).not.toContain("prepare-secret");
    expect(setup.stdout).not.toContain("activation-secret");
    expect(setup.stdout).not.toContain("host-secret");
    expect(setup.stderr).toBe("");
  });

  it("query 成功时传递精确 digest 并输出稳定 JSON Envelope", async () => {
    const setup = createSetup();

    const exitCode = await runCli([...QUERY_ARGUMENTS, "--json"], setup.dependencies);

    expect(exitCode).toBe(CLI_EXIT_CODE_SUCCESS);
    expect(setup.read).not.toHaveBeenCalled();
    expect(setup.queryExecute).toHaveBeenCalledWith(MATRIX_DIGEST);
    expect(JSON.parse(setup.stdout)).toMatchObject({
      status: CliResponseStatus.Success,
      command: CliCommand.ExecutorCompatibilityQuery,
      data: QUERY_OUTPUT,
    });
  });

  it("compile Human 输出仅包含脱敏 Matrix 摘要与 persisted 标记", async () => {
    const setup = createSetup();

    const exitCode = await runCli(COMPILE_ARGUMENTS, setup.dependencies);

    expect(exitCode).toBe(CLI_EXIT_CODE_SUCCESS);
    expect(setup.stdout).toBe(
      `Executor compatibility ${MATRIX_DIGEST}: profile=managed-file-mutation-hooks support=production executor=codex_cli@1.2.3 host=non_interactive_cli/windows/x64 evidence=2 evidencePersistences=host:persisted,contract:persisted matrixPersistence=persisted.\n`,
    );
    expect(setup.stdout).not.toContain(RECORD_DIGEST);
  });

  it("query Human 输出仅包含脱敏 Matrix 摘要与 recomputed 标记", async () => {
    const setup = createSetup();

    const exitCode = await runCli(QUERY_ARGUMENTS, setup.dependencies);

    expect(exitCode).toBe(CLI_EXIT_CODE_SUCCESS);
    expect(setup.stdout).toBe(
      `Executor compatibility ${MATRIX_DIGEST}: profile=managed-file-mutation-hooks support=production executor=codex_cli@1.2.3 host=non_interactive_cli/windows/x64 evidence=2 recomputed=true.\n`,
    );
  });

  it("compile Application 失败时保留提交结果未知退出码", async () => {
    const setup = createSetup();
    setup.compileExecute.mockResolvedValueOnce(
      failure(
        new HarnessError(
          HarnessErrorCode.ExecutorCompatibilityCommitOutcomeUnknown,
          "commit outcome unknown",
        ),
      ),
    );

    const exitCode = await runCli([...COMPILE_ARGUMENTS, "--json"], setup.dependencies);

    expect(exitCode).toBe(CLI_EXIT_CODE_OUTCOME_UNKNOWN);
    expect(JSON.parse(setup.stderr)).toMatchObject({
      status: CliResponseStatus.Failure,
      command: CliCommand.ExecutorCompatibilityCompile,
      error: { code: HarnessErrorCode.ExecutorCompatibilityCommitOutcomeUnknown },
    });
  });

  it("query Application 失败时映射 Matrix NotFound", async () => {
    const setup = createSetup();
    setup.queryExecute.mockResolvedValueOnce(
      failure(
        new HarnessError(HarnessErrorCode.ExecutorCompatibilityMatrixNotFound, "matrix not found"),
      ),
    );

    const exitCode = await runCli(QUERY_ARGUMENTS, setup.dependencies);

    expect(exitCode).toBe(CLI_EXIT_CODE_NOT_FOUND);
    expect(setup.stderr).toContain(HarnessErrorCode.ExecutorCompatibilityMatrixNotFound);
  });
});

function removeOption(args: readonly string[], option: string): string[] {
  const result = [...args];
  const index = result.indexOf(option);
  result.splice(index, 2);
  return result;
}

function createSetup(options: { readonly read?: JsonDocumentReader["read"] } = {}) {
  let stdout = "";
  let stderr = "";
  const documents = new Map<string, unknown>([
    ["prepare.json", { prepareSecret: "prepare-secret" }],
    ["activation.json", { activationSecret: "activation-secret" }],
    ["hostResult.json", { hostSecret: "host-secret" }],
  ]);
  const read = vi.fn(
    options.read ?? ((filePath: string) => Promise.resolve(success(documents.get(filePath)))),
  );
  const compileExecute = vi
    .fn<(input: unknown) => Promise<unknown>>()
    .mockResolvedValue(COMPILE_OUTPUT_RESULT);
  const queryExecute = vi
    .fn<(matrixDigest: unknown) => Promise<unknown>>()
    .mockResolvedValue(QUERY_OUTPUT_RESULT);
  const application = {
    compileCodexExecutorCompatibility: { execute: compileExecute },
    queryExecutorCompatibility: { execute: queryExecute },
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
    jsonDocumentReader: { read },
  };
  return {
    dependencies,
    read,
    compileExecute,
    queryExecute,
    createApplication,
    get stdout() {
      return stdout;
    },
    get stderr() {
      return stderr;
    },
  };
}

const COMPILE_OUTPUT_RESULT = success(COMPILE_OUTPUT);
const QUERY_OUTPUT_RESULT = success(QUERY_OUTPUT);
