import path from "node:path";

import { describe, expect, it } from "vitest";

import { ResultStatus } from "../../src/common/index.js";
import { NodeCommandRunnerAdapter } from "../../src/infrastructure/index.js";

describe("Node Command Runner", () => {
  it("将 stdin 写入子进程并关闭输入流", async () => {
    const result = await new NodeCommandRunnerAdapter().run({
      executable: process.execPath,
      args: [
        "-e",
        "process.stdin.setEncoding('utf8'); process.stdin.on('data', d => process.stdout.write(d));",
      ],
      stdin: "stdin-ok",
      timeoutMs: 1000,
    });

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Failure) return;
    expect(result.value).toMatchObject({ exitCode: 0, stdout: "stdin-ok", stderr: "" });
  });
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

  it("将可选 cwd 传递给非 shell 子进程", async () => {
    const cwd = path.resolve(process.cwd(), "..");
    const result = await new NodeCommandRunnerAdapter().run({
      executable: process.execPath,
      args: ["-e", "process.stdout.write(process.cwd())"],
      cwd,
      timeoutMs: 1000,
    });

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Failure) return;
    expect(path.resolve(result.value.stdout)).toBe(cwd);
  });

  it("使用显式环境变量集合隔离子进程环境", async () => {
    const result = await new NodeCommandRunnerAdapter().run({
      executable: process.execPath,
      args: ["-e", "process.stdout.write(process.env.VERIFICATION_VISIBLE ?? 'missing')"],
      timeoutMs: 1000,
      environment: { VERIFICATION_VISIBLE: "visible" },
    });

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Failure) return;
    expect(result.value).toMatchObject({ exitCode: 0, stdout: "visible", stderr: "" });
  });

  it("输出超过上限时终止并等待子进程关闭", async () => {
    const result = await new NodeCommandRunnerAdapter().run({
      executable: process.execPath,
      args: ["-e", "process.stdout.write('x'.repeat(2048))"],
      timeoutMs: 1000,
      maxOutputBytes: 1024,
    });

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Failure) return;
    expect(result.value).toMatchObject({ exitCode: null, launchError: "output_limit" });
    expect(
      Buffer.byteLength(result.value.stdout) + Buffer.byteLength(result.value.stderr),
    ).toBeLessThanOrEqual(1024);
  });
});
