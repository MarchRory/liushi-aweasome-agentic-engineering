import { EventEmitter } from "node:events";
import { setImmediate } from "node:timers";

import { describe, expect, it, vi } from "vitest";

import { terminateProcessTree } from "../../../scripts/common/process/termination/index.mjs";

describe("Process tree termination", () => {
  it("优先等待进程正常退出，不启动平台强杀命令", async () => {
    const child = createChild();
    child.kill.mockImplementation(() => {
      setImmediate(() => closeChild(child, 0, "SIGTERM"));
      return true;
    });
    const spawnProcess = vi.fn();

    await terminateProcessTree(child, {
      platform: "win32",
      gracePeriodMs: 100,
      forcePeriodMs: 100,
      spawnProcess,
    });

    expect(child.kill).toHaveBeenCalledOnce();
    expect(spawnProcess).not.toHaveBeenCalled();
  });

  it("Windows 宽限期结束后使用 taskkill 终止完整进程树并等待 close", async () => {
    const child = createChild();
    const taskkill = new EventEmitter();
    taskkill.kill = vi.fn();
    const spawnProcess = vi.fn(() => {
      setImmediate(() => {
        taskkill.emit("close", 0, null);
        closeChild(child, 1, "SIGKILL");
      });
      return taskkill;
    });

    await terminateProcessTree(child, {
      platform: "win32",
      gracePeriodMs: 5,
      forcePeriodMs: 100,
      spawnProcess,
    });

    expect(spawnProcess).toHaveBeenCalledWith(
      "taskkill.exe",
      ["/PID", "12345", "/T", "/F"],
      expect.objectContaining({ shell: false, windowsHide: true }),
    );
    expect(child.exitCode).toBe(1);
  });
});

function createChild() {
  const child = new EventEmitter();
  child.pid = 12345;
  child.exitCode = null;
  child.signalCode = null;
  child.kill = vi.fn(() => true);
  return child;
}

function closeChild(child, code, signal) {
  child.exitCode = code;
  child.signalCode = signal;
  child.emit("close", code, signal);
}
