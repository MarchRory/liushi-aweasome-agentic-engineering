import { describe, expect, it } from "vitest";

import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
} from "../../src/common/index.js";
import {
  CODEX_HOOK_FAIL_CLOSED_REASON,
  CapabilityProbeExecutor,
  CapabilityProbeStatus,
  CodexCapabilityName,
  CodexProbeCommandKind,
  type CodexHookResponse,
} from "../../src/application/index.js";
import {
  CliCommand,
  CliOutputFormat,
  NodeJsonDocumentReaderAdapter,
  parseCliArguments,
  runCli,
  type CliApplication,
  type CliWriter,
  type RunCliDependencies,
} from "../../src/presentation/index.js";

describe("CLI Hook wrapper", () => {
  it("解析 hook bind 与 hook handle，并禁止 Hook Handle 使用 CLI Envelope", () => {
    const bind = parseCliArguments([
      "hook",
      "bind",
      "--root",
      "C:/repository",
      "--workspace",
      "workspace-a",
      "--task",
      "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      "--artifact",
      "01ARZ3NDEKTSV4RRFFQ69G5FB0",
      "--artifact-digest",
      `sha256:${"1".repeat(64)}`,
      "--json",
    ]);
    const config = parseCliArguments(["hook", "config", "--executor", "codex"]);
    const probe = parseCliArguments(["hook", "probe", "--executor", "codex", "--json"]);
    const customProbe = parseCliArguments([
      "hook",
      "probe",
      "--executor",
      "codex",
      "--executable",
      " C:/tools/codex.exe ",
    ]);
    const handle = parseCliArguments(["hook", "handle", "--executor", "codex"]);
    const invalidFormat = parseCliArguments(["hook", "handle", "--executor", "codex", "--json"]);

    expect(bind).toMatchObject({
      status: ResultStatus.Success,
      value: { command: CliCommand.HookBind, outputFormat: CliOutputFormat.Json },
    });
    expect(handle).toMatchObject({
      status: ResultStatus.Success,
      value: { command: CliCommand.HookHandle, outputFormat: CliOutputFormat.Human },
    });
    expect(config).toMatchObject({
      status: ResultStatus.Success,
      value: { command: CliCommand.HookConfig, outputFormat: CliOutputFormat.Human },
    });
    expect(probe).toMatchObject({
      status: ResultStatus.Success,
      value: {
        command: CliCommand.HookProbe,
        outputFormat: CliOutputFormat.Json,
        executable: "codex",
      },
    });
    expect(customProbe).toMatchObject({
      status: ResultStatus.Success,
      value: { command: CliCommand.HookProbe, executable: "C:/tools/codex.exe" },
    });
    expect(invalidFormat).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.InvalidInput, details: { option: "--json" } },
    });
  });

  it("hook probe 拒绝空白或包含 NUL 的 executable", () => {
    for (const executable of ["   ", "codex\0.exe"]) {
      const result = parseCliArguments([
        "hook",
        "probe",
        "--executor",
        "codex",
        "--executable",
        executable,
      ]);

      expect(result).toMatchObject({
        status: ResultStatus.Failure,
        error: { code: HarnessErrorCode.InvalidInput, details: { option: "--executable" } },
      });
    }
  });

  it("hook config 只输出可审阅的原生配置对象", async () => {
    const output = await runConfigCommand();

    expect(output.exitCode).toBe(0);
    expect(JSON.parse(output.stdout)).toEqual({ hooks: {} });
    expect(output.stdout).not.toContain('"status"');
    expect(output.stderr).toBe("");
  });

  it("hook probe 使用 CLI JSON Envelope 返回只读能力报告", async () => {
    const output = await runProbeCommand();

    expect(output.exitCode).toBe(0);
    expect(JSON.parse(output.stdout)).toMatchObject({
      status: "success",
      command: CliCommand.HookProbe,
      data: {
        executor: CapabilityProbeExecutor.Codex,
        overallStatus: CapabilityProbeStatus.Unverified,
        productionVerified: false,
      },
    });
    expect(output.stderr).toBe("");
  });

  it("存在响应体时只输出 Codex 原生 Hook 响应，不包裹 CLI JSON Envelope", async () => {
    const output = await runHookCommand(
      success({
        hook_event_name: "PreToolUse",
        tool_name: "apply_patch",
      }),
      success({ body: { hookSpecificOutput: { permissionDecision: "deny" } } }),
    );

    expect(output.exitCode).toBe(0);
    expect(JSON.parse(output.stdout)).toEqual({
      hookSpecificOutput: { permissionDecision: "deny" },
    });
    expect(output.stdout).not.toContain('"status"');
    expect(output.stderr).toBe("");
  });

  it("PreToolUse 原样放行时退出 0 且不输出", async () => {
    const output = await runHookCommand(
      success({ hook_event_name: "PreToolUse", tool_name: "apply_patch" }),
      success({}),
    );

    expect(output).toEqual({ exitCode: 0, stdout: "", stderr: "" });
  });

  it("无法识别 Hook 事件时写入 stderr 并返回拒绝退出码", async () => {
    const inputFailure = await runHookCommand(
      failure(new HarnessError(HarnessErrorCode.InvalidInput, "bad hook input")),
      failure(new HarnessError(HarnessErrorCode.OperationForbidden, "blocked by policy")),
    );
    const readerException = await runHookCommand(
      new Error("reader crashed"),
      failure(new HarnessError(HarnessErrorCode.OperationForbidden, "blocked by policy")),
    );
    const unknownEventFailure = await runHookCommand(
      success({ valid: true }),
      failure(new HarnessError(HarnessErrorCode.OperationForbidden, "blocked by policy")),
    );

    expect(inputFailure).toEqual({ exitCode: 2, stdout: "", stderr: "bad hook input\n" });
    expect(readerException).toEqual({
      exitCode: 2,
      stdout: "",
      stderr: "Codex Hook input reader failed unexpectedly.\n",
    });
    expect(unknownEventFailure).toEqual({
      exitCode: 2,
      stdout: "",
      stderr: "blocked by policy\n",
    });
  });

  it("PreToolUse 处理失败或抛异常时均以结构化 deny 安全拒绝", async () => {
    const input = success({ hook_event_name: "PreToolUse", tool_name: "apply_patch" });
    const processingFailure = await runHookCommand(
      input,
      failure(new HarnessError(HarnessErrorCode.OperationForbidden, "blocked by policy")),
    );
    const handlerException = await runHookCommand(input, new Error("handler crashed"));

    for (const output of [processingFailure, handlerException]) {
      expect(output.exitCode).toBe(0);
      expect(output.stderr).toBe("");
      expect(JSON.parse(output.stdout)).toEqual({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: CODEX_HOOK_FAIL_CLOSED_REASON,
        },
      });
    }
  });

  it("PostToolUse 处理失败时返回 block，禁止 Agent 把未记录动作宣称为成功", async () => {
    const output = await runHookCommand(
      success({ hook_event_name: "PostToolUse", tool_name: "apply_patch" }),
      failure(new HarnessError(HarnessErrorCode.IoFailure, "journal unavailable")),
    );

    expect(output.exitCode).toBe(0);
    expect(output.stderr).toBe("");
    expect(JSON.parse(output.stdout)).toEqual({
      decision: "block",
      reason: CODEX_HOOK_FAIL_CLOSED_REASON,
    });
  });
});

async function runHookCommand(
  input: ReturnType<typeof success<unknown>> | ReturnType<typeof failure<HarnessError>> | Error,
  hookResult:
    | ReturnType<typeof success<CodexHookResponse>>
    | ReturnType<typeof failure<HarnessError>>
    | Error,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  let stdout = "";
  let stderr = "";
  const writer: CliWriter = {
    stdout: (value) => {
      stdout += value;
    },
    stderr: (value) => {
      stderr += value;
    },
  };
  const application = {
    handleCodexHook: {
      execute: () =>
        hookResult instanceof Error ? Promise.reject(hookResult) : Promise.resolve(hookResult),
    },
  } as unknown as CliApplication;
  const dependencies: RunCliDependencies = {
    defaultStoreRoot: ".runtime",
    applicationFactory: { create: () => application },
    writer,
    jsonDocumentReader: new NodeJsonDocumentReaderAdapter(),
    hookInputReader: {
      read: () => (input instanceof Error ? Promise.reject(input) : Promise.resolve(input)),
    },
  };

  const exitCode = await runCli(["hook", "handle", "--executor", "codex"], dependencies);
  return { exitCode, stdout, stderr };
}

async function runConfigCommand(): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  let stdout = "";
  let stderr = "";
  const application = {} as CliApplication;
  const dependencies: RunCliDependencies = {
    defaultStoreRoot: ".runtime",
    applicationFactory: { create: () => application },
    writer: {
      stdout: (value) => {
        stdout += value;
      },
      stderr: (value) => {
        stderr += value;
      },
    },
    jsonDocumentReader: new NodeJsonDocumentReaderAdapter(),
    hookConfigProjector: { project: () => ({ hooks: {} }) },
  };

  const exitCode = await runCli(["hook", "config", "--executor", "codex"], dependencies);
  return { exitCode, stdout, stderr };
}

async function runProbeCommand(): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  let stdout = "";
  let stderr = "";
  const application = {
    probeCodexCapabilities: {
      execute: (request: { executable: string }) => {
        expect(request).toEqual({ executable: "C:/tools/codex.exe" });
        return Promise.resolve(
          success({
            schemaVersion: "2.0.0",
            executor: CapabilityProbeExecutor.Codex,
            executable: request.executable,
            overallStatus: CapabilityProbeStatus.Unverified,
            commandHandler: {
              capability: CodexCapabilityName.CommandHandler,
              status: CapabilityProbeStatus.Unverified,
              evidence: "test",
            },
            preToolUse: {
              capability: CodexCapabilityName.PreToolUse,
              status: CapabilityProbeStatus.Unverified,
              evidence: "test",
            },
            postToolUse: {
              capability: CodexCapabilityName.PostToolUse,
              status: CapabilityProbeStatus.Unverified,
              evidence: "test",
            },
            nativeStdin: {
              capability: CodexCapabilityName.NativeStdin,
              status: CapabilityProbeStatus.Unverified,
              evidence: "test",
            },
            hookFramework: {
              capability: CodexCapabilityName.HookFramework,
              status: CapabilityProbeStatus.Verified,
              evidence: "hooks stable true",
            },
            productionVerified: false,
            commands: [
              {
                kind: CodexProbeCommandKind.Version,
                executable: request.executable,
                args: ["--version"],
              },
              {
                kind: CodexProbeCommandKind.Help,
                executable: request.executable,
                args: ["--help"],
              },
              {
                kind: CodexProbeCommandKind.FeaturesList,
                executable: request.executable,
                args: ["features", "list"],
              },
            ],
          }),
        );
      },
    },
  } as unknown as CliApplication;
  const dependencies: RunCliDependencies = {
    defaultStoreRoot: ".runtime",
    applicationFactory: { create: () => application },
    writer: {
      stdout: (value) => {
        stdout += value;
      },
      stderr: (value) => {
        stderr += value;
      },
    },
    jsonDocumentReader: new NodeJsonDocumentReaderAdapter(),
  };

  const exitCode = await runCli(
    ["hook", "probe", "--executor", "codex", "--executable", "C:/tools/codex.exe", "--json"],
    dependencies,
  );
  return { exitCode, stdout, stderr };
}
