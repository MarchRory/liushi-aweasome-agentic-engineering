import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  CODING_TASK_SESSION_ACTIVATION_REPORT_SCHEMA_VERSION,
  CodingTaskSessionActivationStage,
  CodingTaskSessionActivationStatus,
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "../../src/index.js";
import {
  CLI_EXIT_CODE_CONFLICT,
  CLI_EXIT_CODE_IO_FAILURE,
  CLI_EXIT_CODE_OUTCOME_UNKNOWN,
  CLI_EXIT_CODE_SUCCESS,
  CliCommand,
  CliOutputFormat,
  CliResponseStatus,
  parseCliArguments,
  runCli,
  type CliApplication,
  type RunCliDependencies,
} from "../../src/presentation/index.js";

const ROOT = resolve("repository");
const BASE_ARGS = [
  "coding-task",
  "session",
  "activate",
  "--file",
  "activation.json",
  "--workspace",
  "workspace-1",
  "--repository",
  "repository-1",
  "--root",
  ROOT,
  "--actor-id",
  "agent:codex",
] as const;

describe("CodingTask Session Activate CLI parser", () => {
  it("解析完整参数并规范化 root、store 和 JSON 输出", () => {
    const result = parseCliArguments([...BASE_ARGS, "--store", ".runtime", "--json"]);

    expect(result).toEqual({
      status: ResultStatus.Success,
      value: {
        command: CliCommand.CodingTaskSessionActivate,
        outputFormat: CliOutputFormat.Json,
        storeRoot: ".runtime",
        filePath: "activation.json",
        workspaceId: "workspace-1",
        repositoryId: "repository-1",
        repositoryRoot: ROOT,
        actorId: "agent:codex",
      },
    });
  });

  it.each(["--file", "--workspace", "--repository", "--root", "--actor-id"])(
    "缺少必填选项 %s 时失败",
    (option) => {
      const args = [...BASE_ARGS];
      const index = args.indexOf(option);
      args.splice(index, 2);

      const result = parseCliArguments(args);

      expect(result.status).toBe(ResultStatus.Failure);
    },
  );

  it.each([
    ["相对 root", "repository"],
    ["未知 option", "--unknown"],
    ["额外 positional", "extra"],
  ])("拒绝%s", (_caseName, extra) => {
    const args = extra === "--unknown" ? [...BASE_ARGS, extra, "value"] : [...BASE_ARGS, extra];
    if (_caseName === "相对 root") {
      const rootIndex = args.indexOf(ROOT);
      args[rootIndex] = extra;
    }

    expect(parseCliArguments(args).status).toBe(ResultStatus.Failure);
  });
});

describe("CodingTask Session Activate CLI runner", () => {
  it("waiting_agent 返回成功退出码并传递原始 Manifest", async () => {
    const setup = createSetup(successReport(CodingTaskSessionActivationStatus.WaitingAgent));

    const exitCode = await runCli(
      [...BASE_ARGS, "--store", ".custom", "--json"],
      setup.dependencies,
    );

    expect(exitCode).toBe(CLI_EXIT_CODE_SUCCESS);
    expect(setup.read).toHaveBeenCalledWith("activation.json");
    expect(setup.execute).toHaveBeenCalledWith(setup.manifest);
    expect(setup.createApplication).toHaveBeenCalledWith(".custom", {
      repositoryBinding: {
        workspaceId: "workspace-1",
        repositoryId: "repository-1",
        repositoryRoot: ROOT,
      },
      sessionActorId: "agent:codex",
    });
    expect(JSON.parse(setup.stdout)).toMatchObject({
      status: CliResponseStatus.Success,
      command: CliCommand.CodingTaskSessionActivate,
    });
  });

  it("blocked 返回 conflict 退出码", async () => {
    const setup = createSetup(successReport(CodingTaskSessionActivationStatus.Blocked));

    expect(await runCli([...BASE_ARGS, "--json"], setup.dependencies)).toBe(CLI_EXIT_CODE_CONFLICT);
    expect(JSON.parse(setup.stdout)).toMatchObject({
      status: CliResponseStatus.Blocked,
      data: { status: CodingTaskSessionActivationStatus.Blocked },
    });
  });

  it("outcome_unknown 返回专用退出码", async () => {
    const setup = createSetup(successReport(CodingTaskSessionActivationStatus.OutcomeUnknown));

    expect(await runCli([...BASE_ARGS, "--json"], setup.dependencies)).toBe(
      CLI_EXIT_CODE_OUTCOME_UNKNOWN,
    );
  });

  it("Use Case failure 映射稳定错误退出码", async () => {
    const setup = createSetup(
      failure(new HarnessError(HarnessErrorCode.IoFailure, "activation failed")),
    );

    expect(await runCli([...BASE_ARGS, "--json"], setup.dependencies)).toBe(
      CLI_EXIT_CODE_IO_FAILURE,
    );
    expect(JSON.parse(setup.stderr)).toMatchObject({
      status: CliResponseStatus.Failure,
      command: CliCommand.CodingTaskSessionActivate,
      error: { code: HarnessErrorCode.IoFailure },
    });
  });

  it("JSON reader failure 时不调用 Use Case", async () => {
    const setup = createSetup(
      successReport(CodingTaskSessionActivationStatus.WaitingAgent),
      failure(new HarnessError(HarnessErrorCode.IoFailure, "manifest read failed")),
    );

    expect(await runCli([...BASE_ARGS, "--json"], setup.dependencies)).toBe(
      CLI_EXIT_CODE_IO_FAILURE,
    );
    expect(setup.execute).not.toHaveBeenCalled();
  });

  it("Human 输出只展示状态摘要而不泄漏完整 Manifest", async () => {
    const setup = createSetup(successReport(CodingTaskSessionActivationStatus.WaitingAgent));

    expect(await runCli([...BASE_ARGS], setup.dependencies)).toBe(CLI_EXIT_CODE_SUCCESS);
    expect(setup.stdout).toContain(`status=${CodingTaskSessionActivationStatus.WaitingAgent}`);
    expect(setup.stdout).toContain("stoppedStage=none");
    expect(setup.stdout).toContain("receipts=1");
    expect(setup.stdout).toContain(`worktreeRoot=${ROOT}\\worktree`);
    expect(setup.stdout).not.toContain("manifest-secret");
    expect(setup.stdout).not.toContain("activation.json");
  });
});

function successReport(status: CodingTaskSessionActivationStatus) {
  return success({
    schemaVersion: CODING_TASK_SESSION_ACTIVATION_REPORT_SCHEMA_VERSION,
    status,
    stoppedStage:
      status === CodingTaskSessionActivationStatus.WaitingAgent
        ? undefined
        : CodingTaskSessionActivationStage.Persistence,
    receipts: [{ stage: CodingTaskSessionActivationStage.Create, receipt: { id: "receipt-1" } }],
    worktreeRoot: `${ROOT}\\worktree`,
    manifestSecret: "manifest-secret",
  });
}

function createSetup(
  result: Result<unknown, HarnessError>,
  readerResult: Result<unknown, HarnessError> = success({ manifestSecret: "manifest-secret" }),
) {
  let stdout = "";
  let stderr = "";
  const manifest = { manifestSecret: "manifest-secret" };
  const read = vi.fn(() => Promise.resolve(readerResult));
  const execute = vi.fn(() => Promise.resolve(result));
  const application = { activateCodingTaskSession: { execute } } as unknown as CliApplication;
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
    manifest,
    read,
    execute,
    createApplication,
    get stdout() {
      return stdout;
    },
    get stderr() {
      return stderr;
    },
  };
}
