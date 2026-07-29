import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  CodingTaskDeliveryCompletionStage,
  CodingTaskDeliveryCompletionStatus,
  HarnessErrorCode,
  ResultStatus,
  success,
  type HarnessError,
  type Result,
} from "../../src/index.js";
import {
  CLI_EXIT_CODE_CONFLICT,
  CLI_EXIT_CODE_OUTCOME_UNKNOWN,
  CLI_EXIT_CODE_SUCCESS,
  CliCommand,
  CliApplicationBindingScope,
  CliOutputFormat,
  CliResponseStatus,
  CliVerificationMode,
  parseCliArguments,
  runCli,
  type CliApplication,
  type RunCliDependencies,
} from "../../src/presentation/index.js";

const repositoryRoot = resolve("repository");
const baseArgs = [
  "coding-task",
  "session",
  "complete",
  "--file",
  "completion.json",
  "--workspace",
  "workspace-1",
  "--session",
  "session-1",
  "--repository",
  "repository-1",
  "--root",
  repositoryRoot,
  "--actor-id",
  "agent:codex",
  "--verification-mode",
  "fail_closed_mock",
] as const;

describe("CodingTask Session Complete CLI parser", () => {
  it("解析完整参数并保留显式 Verification mode", () => {
    expect(parseCliArguments([...baseArgs, "--store", ".runtime", "--json"])).toEqual({
      status: ResultStatus.Success,
      value: {
        command: CliCommand.CodingTaskSessionComplete,
        outputFormat: CliOutputFormat.Json,
        storeRoot: ".runtime",
        filePath: "completion.json",
        workspaceId: "workspace-1",
        sessionId: "session-1",
        repositoryId: "repository-1",
        repositoryRoot,
        actorId: "agent:codex",
        verificationMode: CliVerificationMode.FailClosedMock,
      },
    });
  });

  it.each([
    "--file",
    "--workspace",
    "--session",
    "--repository",
    "--root",
    "--actor-id",
    "--verification-mode",
  ])("拒绝缺少必填选项 %s", (option) => {
    const args = [...baseArgs];
    const index = args.indexOf(option);
    args.splice(index, 2);
    expect(parseCliArguments(args).status).toBe(ResultStatus.Failure);
  });

  it("拒绝非法 Verification mode 和额外 option", () => {
    expect(parseCliArguments([...baseArgs.slice(0, -1), "unsupported_mode"]).status).toBe(
      ResultStatus.Failure,
    );
    expect(parseCliArguments([...baseArgs, "--unknown", "value"]).status).toBe(
      ResultStatus.Failure,
    );
  });
});

describe("CodingTask Session Complete CLI runner", () => {
  it("解析后的命令使用 CodingTask Session scope 和显式 Verification mode", async () => {
    const setup = createSetup(
      success(successReport(CodingTaskDeliveryCompletionStatus.ReviewReady)),
    );

    const exitCode = await runCli([...baseArgs, "--json"], setup.dependencies);
    expect(exitCode).toBe(CLI_EXIT_CODE_SUCCESS);
    expect(setup.createApplication).toHaveBeenCalledWith(".runtime", {
      scope: CliApplicationBindingScope.CodingTaskSession,
      repositoryBinding: {
        workspaceId: "workspace-1",
        repositoryId: "repository-1",
        repositoryRoot,
      },
      sessionActorId: "agent:codex",
      verificationMode: CliVerificationMode.FailClosedMock,
    });
  });

  it.each([
    [CodingTaskDeliveryCompletionStatus.ReviewReady, CLI_EXIT_CODE_SUCCESS],
    [CodingTaskDeliveryCompletionStatus.Blocked, CLI_EXIT_CODE_CONFLICT],
    [CodingTaskDeliveryCompletionStatus.OutcomeUnknown, CLI_EXIT_CODE_OUTCOME_UNKNOWN],
    [CodingTaskDeliveryCompletionStatus.VerificationFailed, CLI_EXIT_CODE_CONFLICT],
    [CodingTaskDeliveryCompletionStatus.VerificationBlocked, CLI_EXIT_CODE_CONFLICT],
    [CodingTaskDeliveryCompletionStatus.VerificationWaived, CLI_EXIT_CODE_CONFLICT],
  ] as const)("%s 映射为稳定退出码", async (status, exitCode) => {
    const setup = createSetup(success(successReport(status)));

    expect(await runCli([...baseArgs, "--json"], setup.dependencies)).toBe(exitCode);
    expect(JSON.parse(setup.stdout)).toMatchObject({
      status:
        status === CodingTaskDeliveryCompletionStatus.ReviewReady
          ? CliResponseStatus.Success
          : CliResponseStatus.Blocked,
      command: CliCommand.CodingTaskSessionComplete,
      data: { status },
    });
  });

  it.each([
    [
      "Workspace",
      {
        deliveryCommand: {
          actor: { actorId: "agent:codex" },
          payload: { workspaceId: "workspace-other", sessionId: "session-1" },
        },
        verification: { actor: { actorId: "agent:codex" } },
      },
    ],
    [
      "Session",
      {
        deliveryCommand: {
          actor: { actorId: "agent:codex" },
          payload: { workspaceId: "workspace-1", sessionId: "session-other" },
        },
        verification: { actor: { actorId: "agent:codex" } },
      },
    ],
    [
      "Delivery Actor",
      {
        deliveryCommand: {
          actor: { actorId: "agent:other" },
          payload: { workspaceId: "workspace-1", sessionId: "session-1" },
        },
        verification: { actor: { actorId: "agent:codex" } },
      },
    ],
    [
      "Verification Actor",
      {
        deliveryCommand: {
          actor: { actorId: "agent:codex" },
          payload: { workspaceId: "workspace-1", sessionId: "session-1" },
        },
        verification: { actor: { actorId: "agent:other" } },
      },
    ],
  ] as const)("%s 绑定不一致时在 Application execute 前失败", async (_binding, document) => {
    const setup = createSetup(
      success(successReport(CodingTaskDeliveryCompletionStatus.ReviewReady)),
      success(document),
    );

    expect(await runCli([...baseArgs, "--json"], setup.dependencies)).toBe(CLI_EXIT_CODE_CONFLICT);
    expect(setup.execute).not.toHaveBeenCalled();
    expect(JSON.parse(setup.stderr)).toMatchObject({
      status: CliResponseStatus.Failure,
      error: { code: HarnessErrorCode.PreconditionNotMet },
    });
  });

  it("Human 输出只显示安全摘要", async () => {
    const setup = createSetup(
      success(successReport(CodingTaskDeliveryCompletionStatus.ReviewReady)),
    );

    expect(await runCli([...baseArgs], setup.dependencies)).toBe(CLI_EXIT_CODE_SUCCESS);
    expect(setup.stdout).toContain("status=review_ready");
    expect(setup.stdout).toContain("stoppedStage=none");
    expect(setup.stdout).toContain("deliveryReceipt=true");
    expect(setup.stdout).toContain("verificationReceipt=true");
    expect(setup.stdout).toContain("evidenceBundle=true");
    expect(setup.stdout).toContain("prReadyArtifact=true");
    expect(setup.stdout).not.toContain("/private/worktree");
    expect(setup.stdout).not.toContain("raw-command-output");
  });
});

function successReport(status: CodingTaskDeliveryCompletionStatus) {
  return {
    status,
    stoppedStage:
      status === CodingTaskDeliveryCompletionStatus.ReviewReady
        ? undefined
        : status === CodingTaskDeliveryCompletionStatus.OutcomeUnknown
          ? CodingTaskDeliveryCompletionStage.Delivery
          : CodingTaskDeliveryCompletionStage.Verification,
    deliveryReceipt: { receipt: "delivery" },
    verificationReceipt: { receipt: "verification" },
    evidenceBundle: { privateEvidence: "raw-command-output" },
    prReadyArtifact: { worktreeRoot: "/private/worktree" },
  };
}

function createSetup(
  result: Result<unknown, HarnessError>,
  readerResult: Result<unknown, HarnessError> = success({
    deliveryCommand: {
      actor: { actorId: "agent:codex" },
      payload: { workspaceId: "workspace-1", sessionId: "session-1" },
    },
    verification: { actor: { actorId: "agent:codex" } },
  }),
) {
  let stdout = "";
  let stderr = "";
  const read = vi.fn(() => Promise.resolve(readerResult));
  const execute = vi.fn(() => Promise.resolve(result));
  const application = {
    completeCodingTaskSessionDelivery: { execute },
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
