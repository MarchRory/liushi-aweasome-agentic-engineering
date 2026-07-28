import { spawn } from "node:child_process";
import process from "node:process";
import { clearTimeout, setTimeout } from "node:timers";

const DEFAULT_GRACE_PERIOD_MS = 500;
const DEFAULT_FORCE_PERIOD_MS = 3_000;

export function shouldCreateDetachedProcessGroup(platform = process.platform) {
  return platform !== "win32";
}

export async function terminateProcessTree(child, options = {}) {
  if (hasExited(child)) return;
  const platform = options.platform ?? process.platform;
  const gracePeriodMs = options.gracePeriodMs ?? DEFAULT_GRACE_PERIOD_MS;
  const forcePeriodMs = options.forcePeriodMs ?? DEFAULT_FORCE_PERIOD_MS;
  try {
    child.kill(platform === "win32" ? undefined : "SIGTERM");
  } catch {
    // 进程可能已在检查后退出，后续仍以 close/exit 状态为准。
  }
  if (await waitForProcessExit(child, gracePeriodMs)) return;

  if (platform === "win32") {
    await terminateWindowsProcessTree(child, options.spawnProcess ?? spawn, forcePeriodMs);
  } else {
    terminatePosixProcessGroup(child);
  }
  if (await waitForProcessExit(child, forcePeriodMs)) return;

  const error = new Error("子进程树在强制终止后仍未退出。");
  error.processMayBeRunning = true;
  throw error;
}

async function terminateWindowsProcessTree(child, spawnProcess, timeoutMs) {
  if (!Number.isInteger(child.pid) || child.pid <= 0) {
    child.kill("SIGKILL");
    return;
  }
  await new Promise((resolve) => {
    let taskkill;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve();
    };
    const timeout = setTimeout(() => {
      try {
        taskkill?.kill();
      } catch {
        // taskkill 已退出时无需额外处理。
      }
      finish();
    }, timeoutMs);
    try {
      taskkill = spawnProcess("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
        shell: false,
        stdio: "ignore",
        windowsHide: true,
      });
      taskkill.once("error", finish);
      taskkill.once("close", finish);
    } catch {
      finish();
    }
  });
  try {
    child.kill("SIGKILL");
  } catch {
    // taskkill 可能已经完成终止。
  }
}

function terminatePosixProcessGroup(child) {
  try {
    if (Number.isInteger(child.pid) && child.pid > 0) {
      process.kill(-child.pid, "SIGKILL");
      return;
    }
  } catch {
    // 无法按进程组终止时退回直接终止。
  }
  try {
    child.kill("SIGKILL");
  } catch {
    // 进程可能已在终止请求之间退出。
  }
}

function waitForProcessExit(child, timeoutMs) {
  if (hasExited(child)) return Promise.resolve(true);
  return new Promise((resolve) => {
    const finish = (exited) => {
      clearTimeout(timeout);
      child.off("close", onClose);
      resolve(exited);
    };
    const onClose = () => finish(true);
    const timeout = setTimeout(() => finish(hasExited(child)), timeoutMs);
    child.once("close", onClose);
    if (hasExited(child)) finish(true);
  });
}

function hasExited(child) {
  return child.exitCode !== null && child.exitCode !== undefined
    ? true
    : child.signalCode !== null && child.signalCode !== undefined;
}
