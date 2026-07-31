import { spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import process from "node:process";
import { clearTimeout, setTimeout } from "node:timers";

import { CODEX_APP_SERVER_PROCESS_TERMINATION_DEFAULTS } from "../constants/index.js";
import { terminatePosixProcessGroup } from "./posixProcessGroupTermination.js";
import { terminateWindowsProcessTree } from "./windowsProcessTreeTermination.js";

/** 进程树终止器的可选等待和平台依赖。 */
export interface CodexAppServerProcessTerminationOptions {
  /** 覆盖平台选择，主要用于验证。 */
  readonly platform?: string;
  /** 首次终止信号后的宽限时间，单位为毫秒。 */
  readonly gracePeriodMs?: number;
  /** 强制终止后的等待时间，单位为毫秒。 */
  readonly forcePeriodMs?: number;
  /** Windows taskkill 的可注入进程启动器。 */
  readonly spawnProcess?: typeof spawn;
}

/** 判断目标平台是否需要独立 POSIX 进程组。 */
export function shouldCreateDetachedProcessGroup(platform = process.platform): boolean {
  return platform !== "win32";
}

/** 先发送温和信号，再按平台终止并确认进程树状态。 */
export async function terminateProcessTree(
  child: ChildProcessWithoutNullStreams,
  options: CodexAppServerProcessTerminationOptions = {},
): Promise<void> {
  if (hasExited(child)) return;

  const platform = options.platform ?? process.platform;
  const gracePeriodMs =
    options.gracePeriodMs ?? CODEX_APP_SERVER_PROCESS_TERMINATION_DEFAULTS.GracePeriodMs;
  const forcePeriodMs =
    options.forcePeriodMs ?? CODEX_APP_SERVER_PROCESS_TERMINATION_DEFAULTS.ForcePeriodMs;

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

  throw new Error("子进程树在强制终止后仍未退出。", {
    cause: new Error("process tree termination was not confirmed"),
  });
}

/** 等待子进程 close 事件或确认它已经退出。 */
export function waitForProcessExit(
  child: ChildProcessWithoutNullStreams,
  timeoutMs: number,
): Promise<boolean> {
  if (hasExited(child)) return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    const finish = (exited: boolean): void => {
      clearTimeout(timeout);
      child.off("close", onClose);
      resolve(exited);
    };
    const onClose = (): void => finish(true);
    const timeout = setTimeout(() => finish(hasExited(child)), timeoutMs);
    child.once("close", onClose);
    if (hasExited(child)) finish(true);
  });
}

/** 判断子进程是否已有退出码或终止信号。 */
export function hasExited(child: ChildProcessWithoutNullStreams): boolean {
  return child.exitCode !== null && child.exitCode !== undefined
    ? true
    : child.signalCode !== null && child.signalCode !== undefined;
}
