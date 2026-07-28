import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import { setImmediate } from "node:timers";

import { describe, expect, it, vi } from "vitest";

import { listCodexSessionHooks } from "../../../scripts/codexAgentPilot/host/appServer/index.mjs";

describe("Codex app-server client", () => {
  it("严格按 initialize -> initialized -> hooks/list 顺序完成只读协议", async () => {
    const fake = createFakeAppServer();
    const spawnProcess = vi.fn(() => fake.child);
    const result = await listCodexSessionHooks(
      {
        executable: "codex.exe",
        arguments: ["app-server", "--stdio"],
        cwd: "C:\\worktree",
        codexHome: "C:\\isolated-home",
        timeoutMs: 1_000,
      },
      { spawnProcess },
    );

    expect(fake.messages.map((message) => message.method)).toEqual([
      "initialize",
      "initialized",
      "hooks/list",
    ]);
    expect(fake.messages[2].params.cwds).toEqual(["C:\\worktree"]);
    expect(result.initializeResult.platformFamily).toBe("windows");
    expect(result.hooksListResponse).toEqual({ data: [] });
    expect(spawnProcess).toHaveBeenCalledWith(
      "codex.exe",
      ["app-server", "--stdio"],
      expect.objectContaining({
        cwd: "C:\\worktree",
        shell: false,
        windowsHide: true,
      }),
    );
  });

  it("未知响应 ID fail closed 并终止进程", async () => {
    const fake = createFakeAppServer({ initializeResponseId: 99 });
    const terminateProcessTree = createFakeTerminator();

    await expect(
      listCodexSessionHooks(
        {
          executable: "codex.exe",
          arguments: ["app-server", "--stdio"],
          cwd: "C:\\worktree",
          codexHome: "C:\\isolated-home",
          timeoutMs: 1_000,
        },
        { spawnProcess: () => fake.child, terminateProcessTree },
      ),
    ).rejects.toThrow("未知响应 ID");
    expect(fake.child.kill).toHaveBeenCalledOnce();
    expect(terminateProcessTree).toHaveBeenCalledOnce();
  });

  it("超时后等待进程关闭才返回失败", async () => {
    const fake = createFakeAppServer({ ignoreInitialize: true });
    const terminateProcessTree = createFakeTerminator();

    await expect(
      listCodexSessionHooks(
        {
          executable: "codex.exe",
          arguments: ["app-server", "--stdio"],
          cwd: "C:\\worktree",
          codexHome: "C:\\isolated-home",
          timeoutMs: 10,
        },
        { spawnProcess: () => fake.child, terminateProcessTree },
      ),
    ).rejects.toThrow("超时");
    expect(fake.closed()).toBe(true);
    expect(terminateProcessTree).toHaveBeenCalledOnce();
  });

  it("stdin 同步写入失败时仍终止并等待进程退出", async () => {
    const fake = createFakeAppServer({ throwOnWrite: true });
    const terminateProcessTree = createFakeTerminator();

    await expect(
      listCodexSessionHooks(
        {
          executable: "codex.exe",
          arguments: ["app-server", "--stdio"],
          cwd: "C:\\worktree",
          codexHome: "C:\\isolated-home",
          timeoutMs: 1_000,
        },
        { spawnProcess: () => fake.child, terminateProcessTree },
      ),
    ).rejects.toThrow("stdin 写入失败");
    expect(fake.closed()).toBe(true);
    expect(terminateProcessTree).toHaveBeenCalledOnce();
  });
});

function createFakeAppServer(options = {}) {
  const child = new EventEmitter();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const messages = [];
  let inputBuffer = "";
  child.stdout = stdout;
  child.stderr = stderr;
  child.kill = vi.fn(() => true);
  child.stdin = new Writable({
    write(chunk, _encoding, callback) {
      inputBuffer += chunk.toString("utf8");
      const lines = inputBuffer.split(/\r?\n/u);
      inputBuffer = lines.pop() ?? "";
      for (const line of lines.filter(Boolean)) {
        const message = JSON.parse(line);
        messages.push(message);
        if (message.method === "initialize" && options.ignoreInitialize !== true) {
          setImmediate(() => {
            stdout.write(
              `${JSON.stringify({
                id: options.initializeResponseId ?? message.id,
                result: {
                  codexHome: "C:\\isolated-home",
                  platformFamily: "windows",
                  platformOs: "windows",
                  userAgent: "liushi-harness/0.145.0",
                },
              })}\n`,
            );
          });
        }
        if (message.method === "hooks/list") {
          setImmediate(() => {
            stdout.write(`${JSON.stringify({ id: message.id, result: { data: [] } })}\n`);
            setImmediate(() => {
              child.exitCode = 0;
              child.emit("close", 0, null);
            });
          });
        }
      }
      callback();
    },
  });
  if (options.throwOnWrite === true) {
    child.stdin.write = () => {
      throw new Error("fixture write failure");
    };
  }
  return { child, messages, closed: () => child.exitCode !== undefined };
}

function createFakeTerminator() {
  return vi.fn(async (child) => {
    child.kill();
    child.exitCode = 1;
    child.emit("close", 1, "SIGTERM");
  });
}
