import { describe, expect, it } from "vitest";

import {
  CapabilityProbeStatus,
  CodexCapabilityName,
  CodexProbeCommand,
} from "../../src/application/index.js";
import { ResultStatus, success, type Result } from "../../src/common/index.js";
import {
  CodexCapabilityProbeAdapter,
  type CommandRunRequest,
  type CommandRunResult,
  type CommandRunner,
} from "../../src/infrastructure/index.js";

describe("Codex Capability Probe", () => {
  it("从版本和帮助输出生成静态能力报告，但不宣称生产支持", async () => {
    const runner = createRunner([
      { exitCode: 0, stdout: "codex 1.2.3\n", stderr: "" },
      { exitCode: 0, stdout: "PreToolUse PostToolUse stdin\n", stderr: "" },
    ]);

    const result = await new CodexCapabilityProbeAdapter(runner).probe();

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Failure) return;
    expect(result.value).toMatchObject({
      schemaVersion: "1.0.0",
      version: "1.2.3",
      overallStatus: CapabilityProbeStatus.Verified,
      productionVerified: false,
      commands: [CodexProbeCommand.Version, CodexProbeCommand.Help],
      commandHandler: {
        capability: CodexCapabilityName.CommandHandler,
        status: CapabilityProbeStatus.Verified,
      },
      preToolUse: { status: CapabilityProbeStatus.Verified },
      postToolUse: { status: CapabilityProbeStatus.Verified },
      nativeStdin: { status: CapabilityProbeStatus.Verified },
    });
  });

  it("未知版本不会被判定为已验证", async () => {
    const runner = createRunner([
      { exitCode: 0, stdout: "Codex development channel\n", stderr: "" },
      { exitCode: 0, stdout: "PreToolUse\n", stderr: "" },
    ]);

    const result = await new CodexCapabilityProbeAdapter(runner).probe();

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Failure) return;
    expect(result.value.version).toBe("unknown");
    expect(result.value.overallStatus).toBe(CapabilityProbeStatus.Unverified);
    expect(result.value.commandHandler.status).toBe(CapabilityProbeStatus.Unverified);
  });

  it("Access Denied 和超时均 fail-closed 为未验证", async () => {
    const runner = createRunner([
      { exitCode: null, stdout: "", stderr: "", launchError: "EACCES" },
      { exitCode: null, stdout: "", stderr: "", launchError: "timeout" },
    ]);

    const result = await new CodexCapabilityProbeAdapter(runner).probe();

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Failure) return;
    expect(result.value.overallStatus).toBe(CapabilityProbeStatus.Unverified);
    expect(result.value.commandHandler.status).toBe(CapabilityProbeStatus.Unverified);
    expect(result.value.preToolUse.status).toBe(CapabilityProbeStatus.Unverified);
  });

  it("找不到 Codex 时返回 unavailable，而不是抛出异常", async () => {
    const runner = createRunner([
      { exitCode: null, stdout: "", stderr: "", launchError: "ENOENT" },
      { exitCode: null, stdout: "", stderr: "", launchError: "ENOENT" },
    ]);

    const result = await new CodexCapabilityProbeAdapter(runner).probe();

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Failure) return;
    expect(result.value.overallStatus).toBe(CapabilityProbeStatus.Unavailable);
    expect(result.value.commandHandler.status).toBe(CapabilityProbeStatus.Unavailable);
  });
});

function createRunner(responses: readonly CommandRunResult[]): CommandRunner {
  let index = 0;
  return {
    run(request: CommandRunRequest): Promise<Result<CommandRunResult, never>> {
      expect(request.executable).toBe("codex");
      expect(request.timeoutMs).toBeGreaterThan(0);
      const response = responses[index];
      index += 1;
      if (response === undefined) {
        throw new Error("测试 Runner 响应不足。");
      }
      return Promise.resolve(success(response));
    },
  };
}
