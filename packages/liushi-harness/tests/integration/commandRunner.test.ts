import { describe, expect, it } from "vitest";

import { ResultStatus } from "../../src/common/index.js";
import { NodeCommandRunnerAdapter } from "../../src/infrastructure/index.js";

describe("Node Command Runner", () => {
  it("使用非 shell 子进程收集 stdout 和退出码", async () => {
    const result = await new NodeCommandRunnerAdapter().run({
      executable: process.execPath,
      args: ["-e", "process.stdout.write('probe-ok')"],
      timeoutMs: 1000,
    });

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Failure) return;
    expect(result.value).toMatchObject({ exitCode: 0, stdout: "probe-ok", stderr: "" });
  });

  it("超时返回稳定诊断而不抛出异常", async () => {
    const result = await new NodeCommandRunnerAdapter().run({
      executable: process.execPath,
      args: ["-e", "setTimeout(() => {}, 1000)"],
      timeoutMs: 50,
    });

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Failure) return;
    expect(result.value).toMatchObject({ exitCode: null, launchError: "timeout" });
  });

  it("同步启动异常也转换为稳定诊断", async () => {
    const result = await new NodeCommandRunnerAdapter().run({
      executable: "",
      args: [],
      timeoutMs: 1000,
    });

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Failure) return;
    expect(result.value.exitCode).toBeNull();
    expect(result.value.launchError).toBeTruthy();
  });
});
