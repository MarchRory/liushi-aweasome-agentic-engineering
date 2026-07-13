import { describe, expect, it } from "vitest";

import {
  CapabilityProbeStatus,
  CODEX_CAPABILITY_PROBE_MAX_OUTPUT_BYTES,
  CodexCapabilityName,
  CodexProbeCommandKind,
} from "../../src/application/index.js";
import { ResultStatus, success, type Result } from "../../src/common/index.js";
import {
  CodexCapabilityProbeAdapter,
  type CommandRunRequest,
  type CommandRunResult,
  type CommandRunner,
} from "../../src/infrastructure/index.js";

const CUSTOM_EXECUTABLE = "C:/tools/codex.exe";

describe("Codex Capability Probe", () => {
  it("使用显式 executable 执行三个只读命令并记录实际参数", async () => {
    const fixture = createRunner([
      { exitCode: 0, stdout: "codex-cli 1.2.3\n", stderr: "" },
      { exitCode: 0, stdout: "PreToolUse PostToolUse stdin\n", stderr: "" },
      { exitCode: 0, stdout: "hooks stable true\n", stderr: "" },
    ]);

    const result = await new CodexCapabilityProbeAdapter(fixture.runner).probe({
      executable: CUSTOM_EXECUTABLE,
    });

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Failure) return;
    expect(fixture.requests).toEqual([
      expect.objectContaining({
        executable: CUSTOM_EXECUTABLE,
        args: ["--version"],
        maxOutputBytes: CODEX_CAPABILITY_PROBE_MAX_OUTPUT_BYTES,
      }),
      expect.objectContaining({
        executable: CUSTOM_EXECUTABLE,
        args: ["--help"],
        maxOutputBytes: CODEX_CAPABILITY_PROBE_MAX_OUTPUT_BYTES,
      }),
      expect.objectContaining({
        executable: CUSTOM_EXECUTABLE,
        args: ["features", "list"],
        maxOutputBytes: CODEX_CAPABILITY_PROBE_MAX_OUTPUT_BYTES,
      }),
    ]);
    expect(result.value).toMatchObject({
      schemaVersion: "2.0.0",
      executable: CUSTOM_EXECUTABLE,
      version: "1.2.3",
      overallStatus: CapabilityProbeStatus.Verified,
      productionVerified: false,
      commands: [
        {
          kind: CodexProbeCommandKind.Version,
          executable: CUSTOM_EXECUTABLE,
          args: ["--version"],
        },
        {
          kind: CodexProbeCommandKind.Help,
          executable: CUSTOM_EXECUTABLE,
          args: ["--help"],
        },
        {
          kind: CodexProbeCommandKind.FeaturesList,
          executable: CUSTOM_EXECUTABLE,
          args: ["features", "list"],
        },
      ],
      commandHandler: {
        capability: CodexCapabilityName.CommandHandler,
        status: CapabilityProbeStatus.Verified,
      },
      hookFramework: {
        capability: CodexCapabilityName.HookFramework,
        status: CapabilityProbeStatus.Verified,
      },
      preToolUse: { status: CapabilityProbeStatus.Verified },
      postToolUse: { status: CapabilityProbeStatus.Verified },
      nativeStdin: { status: CapabilityProbeStatus.Verified },
    });
  });

  it("不会仅凭 hooks 功能开关推断具体 Hook 或 stdin 协议", async () => {
    const fixture = createRunner([
      { exitCode: 0, stdout: "codex 1.2.3\n", stderr: "" },
      { exitCode: 0, stdout: "General command help\n", stderr: "" },
      { exitCode: 0, stdout: "hooks stable true\n", stderr: "" },
    ]);

    const result = await new CodexCapabilityProbeAdapter(fixture.runner).probe({
      executable: "codex",
    });

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Failure) return;
    expect(result.value.hookFramework.status).toBe(CapabilityProbeStatus.Verified);
    expect(result.value.preToolUse.status).toBe(CapabilityProbeStatus.Unverified);
    expect(result.value.postToolUse.status).toBe(CapabilityProbeStatus.Unverified);
    expect(result.value.nativeStdin.status).toBe(CapabilityProbeStatus.Unverified);
    expect(result.value.productionVerified).toBe(false);
  });

  it("否定句和带前后缀的标识符不会被误判为能力声明", async () => {
    const fixture = createRunner([
      { exitCode: 0, stdout: "codex 1.2.3\n", stderr: "" },
      {
        exitCode: 0,
        stdout: "PreToolUse is not supported\nplugin_posttooluse_legacy\nstdin is unavailable\n",
        stderr: "",
      },
      { exitCode: 0, stdout: "hooks stable true\n", stderr: "" },
    ]);

    const result = await new CodexCapabilityProbeAdapter(fixture.runner).probe({
      executable: "codex",
    });

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Failure) return;
    expect(result.value.preToolUse.status).toBe(CapabilityProbeStatus.Unverified);
    expect(result.value.postToolUse.status).toBe(CapabilityProbeStatus.Unverified);
    expect(result.value.nativeStdin.status).toBe(CapabilityProbeStatus.Unverified);
  });

  it.each([
    ["hooks stable false\n", "disabled"],
    ["plugin_hooks removed true\n", "missing"],
    ["hooks stable true extra-column\n", "malformed"],
  ])("hooks 行为 %s 时保持未验证", async (featuresOutput) => {
    const fixture = createRunner([
      { exitCode: 0, stdout: "codex 1.2.3\n", stderr: "" },
      { exitCode: 0, stdout: "General command help\n", stderr: "" },
      { exitCode: 0, stdout: featuresOutput, stderr: "" },
    ]);

    const result = await new CodexCapabilityProbeAdapter(fixture.runner).probe({
      executable: "codex",
    });

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Failure) return;
    expect(result.value.hookFramework.status).toBe(CapabilityProbeStatus.Unverified);
  });

  it("未知版本不会被判定为静态探测已验证", async () => {
    const fixture = createRunner([
      { exitCode: 0, stdout: "Codex development channel\n", stderr: "" },
      { exitCode: 0, stdout: "General command help\n", stderr: "" },
      { exitCode: 0, stdout: "hooks stable true\n", stderr: "" },
    ]);

    const result = await new CodexCapabilityProbeAdapter(fixture.runner).probe({
      executable: "codex",
    });

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Failure) return;
    expect(result.value.version).toBe("unknown");
    expect(result.value.overallStatus).toBe(CapabilityProbeStatus.Unverified);
    expect(result.value.commandHandler.status).toBe(CapabilityProbeStatus.Unverified);
  });

  it("Access Denied、超时和非零退出均 fail closed", async () => {
    const fixture = createRunner([
      { exitCode: null, stdout: "", stderr: "", launchError: "EACCES" },
      { exitCode: null, stdout: "", stderr: "", launchError: "timeout" },
      { exitCode: 2, stdout: "", stderr: "unsupported" },
    ]);

    const result = await new CodexCapabilityProbeAdapter(fixture.runner).probe({
      executable: "codex",
    });

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Failure) return;
    expect(result.value.overallStatus).toBe(CapabilityProbeStatus.Unverified);
    expect(result.value.commandHandler.status).toBe(CapabilityProbeStatus.Unverified);
    expect(result.value.preToolUse.status).toBe(CapabilityProbeStatus.Unverified);
    expect(result.value.hookFramework.status).toBe(CapabilityProbeStatus.Unverified);
  });

  it("输出超限时保持未验证", async () => {
    const fixture = createRunner([
      { exitCode: null, stdout: "", stderr: "", launchError: "output_limit" },
      { exitCode: null, stdout: "", stderr: "", launchError: "output_limit" },
      { exitCode: null, stdout: "", stderr: "", launchError: "output_limit" },
    ]);

    const result = await new CodexCapabilityProbeAdapter(fixture.runner).probe({
      executable: "codex",
    });

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Failure) return;
    expect(result.value.overallStatus).toBe(CapabilityProbeStatus.Unverified);
    expect(result.value.commandHandler.evidence).toContain("output_limit");
    expect(result.value.hookFramework.status).toBe(CapabilityProbeStatus.Unverified);
  });

  it("版本命令非零退出时不采信输出中的版本号", async () => {
    const fixture = createRunner([
      { exitCode: 2, stdout: "codex 9.9.9\n", stderr: "failed" },
      { exitCode: 0, stdout: "General command help\n", stderr: "" },
      { exitCode: 0, stdout: "hooks stable true\n", stderr: "" },
    ]);

    const result = await new CodexCapabilityProbeAdapter(fixture.runner).probe({
      executable: "codex",
    });

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Failure) return;
    expect(result.value.version).toBe("unknown");
    expect(result.value.commandHandler.status).toBe(CapabilityProbeStatus.Unverified);
    expect(result.value.commandHandler.evidence).toBe("static command exited with code 2");
  });

  it("找不到 Codex 时返回 unavailable，而不是抛出异常", async () => {
    const fixture = createRunner([
      { exitCode: null, stdout: "", stderr: "", launchError: "ENOENT" },
      { exitCode: null, stdout: "", stderr: "", launchError: "ENOENT" },
      { exitCode: null, stdout: "", stderr: "", launchError: "ENOENT" },
    ]);

    const result = await new CodexCapabilityProbeAdapter(fixture.runner).probe({
      executable: "codex",
    });

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Failure) return;
    expect(result.value.overallStatus).toBe(CapabilityProbeStatus.Unavailable);
    expect(result.value.commandHandler.status).toBe(CapabilityProbeStatus.Unavailable);
    expect(result.value.hookFramework.status).toBe(CapabilityProbeStatus.Unavailable);
  });

  it("零退出但没有输出时保持未验证", async () => {
    const fixture = createRunner([
      { exitCode: 0, stdout: "", stderr: "" },
      { exitCode: 0, stdout: "", stderr: "" },
      { exitCode: 0, stdout: "", stderr: "" },
    ]);

    const result = await new CodexCapabilityProbeAdapter(fixture.runner).probe({
      executable: "codex",
    });

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Failure) return;
    expect(result.value.overallStatus).toBe(CapabilityProbeStatus.Unverified);
    expect(result.value.hookFramework.status).toBe(CapabilityProbeStatus.Unverified);
  });
});

function createRunner(responses: readonly CommandRunResult[]): {
  runner: CommandRunner;
  requests: CommandRunRequest[];
} {
  let index = 0;
  const requests: CommandRunRequest[] = [];
  return {
    requests,
    runner: {
      run(request: CommandRunRequest): Promise<Result<CommandRunResult, never>> {
        requests.push(request);
        expect(request.timeoutMs).toBeGreaterThan(0);
        const response = responses[index];
        index += 1;
        if (response === undefined) {
          throw new Error("测试 Runner 响应不足。");
        }
        return Promise.resolve(success(response));
      },
    },
  };
}
