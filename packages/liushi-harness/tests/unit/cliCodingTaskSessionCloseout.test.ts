import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  CodingTaskSessionCloseoutStage,
  CodingTaskSessionCloseoutStatus,
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

const repositoryRoot = resolve("repository");
const baseArgs = [
  "coding-task",
  "session",
  "closeout",
  "--file",
  "closeout.json",
  "--workspace",
  "workspace-1",
  "--repository",
  "repository-1",
  "--root",
  repositoryRoot,
  "--actor-id",
  "agent:codex",
] as const;

describe("CodingTask Session Closeout CLI parser", () => {
  it("解析严格文件输入与 Repository、Actor 绑定", () => {
    const result = parseCliArguments([...baseArgs, "--store", ".runtime", "--json"]);

    expect(result).toEqual({
      status: ResultStatus.Success,
      value: {
        command: CliCommand.CodingTaskSessionCloseout,
        outputFormat: CliOutputFormat.Json,
        storeRoot: ".runtime",
        filePath: "closeout.json",
        workspaceId: "workspace-1",
        repositoryId: "repository-1",
        repositoryRoot,
        actorId: "agent:codex",
      },
    });
  });

  it.each(["--file", "--workspace", "--repository", "--root", "--actor-id"])(
    "缺少必填选项 %s 时失败",
    (option) => {
      const args = [...baseArgs];
      const index = args.indexOf(option);
      args.splice(index, 2);

      expect(parseCliArguments(args).status).toBe(ResultStatus.Failure);
    },
  );
});

describe("CodingTask Session Closeout CLI runner", () => {
  it("CheckpointBound 返回成功，并使用显式 Session Runtime Binding", async () => {
    const setup = createSetup(
      success(closeoutState(CodingTaskSessionCloseoutStatus.CheckpointBound)),
    );

    const exitCode = await runCli(
      [...baseArgs, "--store", ".custom", "--json"],
      setup.dependencies,
    );

    expect(exitCode).toBe(CLI_EXIT_CODE_SUCCESS);
    expect(setup.read).toHaveBeenCalledWith("closeout.json");
    expect(setup.execute).toHaveBeenCalledWith(setup.document);
    expect(setup.createApplication).toHaveBeenCalledWith(".custom", {
      repositoryBinding: {
        workspaceId: "workspace-1",
        repositoryId: "repository-1",
        repositoryRoot,
      },
      sessionActorId: "agent:codex",
    });
    expect(JSON.parse(setup.stdout)).toMatchObject({
      status: CliResponseStatus.Success,
      command: CliCommand.CodingTaskSessionCloseout,
      data: { status: CodingTaskSessionCloseoutStatus.CheckpointBound },
    });
  });

  it("Blocked 与 OutcomeUnknown 分别返回稳定冲突和未知退出码", async () => {
    const blocked = createSetup(success(closeoutState(CodingTaskSessionCloseoutStatus.Blocked)));
    const unknown = createSetup(
      success(closeoutState(CodingTaskSessionCloseoutStatus.OutcomeUnknown)),
    );

    expect(await runCli([...baseArgs, "--json"], blocked.dependencies)).toBe(
      CLI_EXIT_CODE_CONFLICT,
    );
    expect(await runCli([...baseArgs, "--json"], unknown.dependencies)).toBe(
      CLI_EXIT_CODE_OUTCOME_UNKNOWN,
    );
    expect(JSON.parse(blocked.stdout)).toMatchObject({
      status: CliResponseStatus.Blocked,
      command: CliCommand.CodingTaskSessionCloseout,
    });
    expect(JSON.parse(unknown.stdout)).toMatchObject({
      status: CliResponseStatus.Blocked,
      data: { status: CodingTaskSessionCloseoutStatus.OutcomeUnknown },
    });
  });

  it("读取或 Use Case 失败时保持错误分类", async () => {
    const useCaseFailure = createSetup(
      failure(new HarnessError(HarnessErrorCode.IoFailure, "closeout failed")),
    );
    const readFailure = createSetup(
      success(closeoutState(CodingTaskSessionCloseoutStatus.CheckpointBound)),
      failure(new HarnessError(HarnessErrorCode.IoFailure, "document read failed")),
    );

    expect(await runCli([...baseArgs, "--json"], useCaseFailure.dependencies)).toBe(
      CLI_EXIT_CODE_IO_FAILURE,
    );
    expect(await runCli([...baseArgs, "--json"], readFailure.dependencies)).toBe(
      CLI_EXIT_CODE_IO_FAILURE,
    );
    expect(readFailure.execute).not.toHaveBeenCalled();
  });

  it.each([
    [
      "Actor",
      {
        actor: { actorId: "agent:other" },
        payload: { workspaceId: "workspace-1" },
      },
    ],
    [
      "Workspace",
      {
        actor: { actorId: "agent:codex" },
        payload: { workspaceId: "workspace-other" },
      },
    ],
  ])("CLI %s 与 Envelope 不一致时在领域调用前 fail closed", async (_name, document) => {
    const setup = createSetup(
      success(closeoutState(CodingTaskSessionCloseoutStatus.CheckpointBound)),
      success(document),
    );

    expect(await runCli([...baseArgs, "--json"], setup.dependencies)).toBe(CLI_EXIT_CODE_CONFLICT);
    expect(setup.execute).not.toHaveBeenCalled();
    expect(JSON.parse(setup.stderr)).toMatchObject({
      status: CliResponseStatus.Failure,
      error: { code: HarnessErrorCode.PreconditionNotMet },
    });
  });

  it("Human 输出只暴露状态和证据存在性，不泄漏证据正文", async () => {
    const setup = createSetup(
      success(closeoutState(CodingTaskSessionCloseoutStatus.CheckpointBound)),
    );

    expect(await runCli([...baseArgs], setup.dependencies)).toBe(CLI_EXIT_CODE_SUCCESS);
    expect(setup.stdout).toContain(`status=${CodingTaskSessionCloseoutStatus.CheckpointBound}`);
    expect(setup.stdout).toContain("snapshot=true");
    expect(setup.stdout).toContain("coverage=true");
    expect(setup.stdout).toContain("checkpoint=true");
    expect(setup.stdout).not.toContain("private-evidence");
  });
});

function closeoutState(status: CodingTaskSessionCloseoutStatus) {
  const terminal = status !== CodingTaskSessionCloseoutStatus.CheckpointBound;
  return {
    status,
    stoppedStage: terminal ? CodingTaskSessionCloseoutStage.SnapshotPersisted : null,
    version: 2,
    snapshot: { privateEvidence: "private-evidence" },
    coverageManifest: { privateEvidence: "private-evidence" },
    checkpoint: status === CodingTaskSessionCloseoutStatus.Blocked ? null : { checkpointId: "cp" },
    errorCode: terminal ? HarnessErrorCode.CodingTaskSessionCloseoutCheckpointNotApplied : null,
  };
}

function createSetup(
  result: Result<unknown, HarnessError>,
  readerResult: Result<unknown, HarnessError> = success({ commandSecret: "private-command" }),
) {
  let stdout = "";
  let stderr = "";
  const document = { commandSecret: "private-command" };
  const read = vi.fn(() => Promise.resolve(readerResult));
  const execute = vi.fn(() => Promise.resolve(result));
  const application = { closeoutCodingTaskSession: { execute } } as unknown as CliApplication;
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
    document,
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
