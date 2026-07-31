import { spawn } from "node:child_process";
import type { ChildProcess, ChildProcessWithoutNullStreams } from "node:child_process";
import { clearTimeout, setTimeout } from "node:timers";

/** Windows 进程树终止所需的可注入依赖。 */
export interface CodexAppServerWindowsTerminationOptions {
  /** 用于启动 taskkill.exe 的进程启动器。 */
  readonly spawnProcess?: typeof spawn;
}

/** 通过 taskkill.exe 终止 Windows 子进程树并回收主进程。 */
export async function terminateWindowsProcessTree(
  child: ChildProcessWithoutNullStreams,
  spawnProcess: typeof spawn = spawn,
  timeoutMs: number,
): Promise<void> {
  const pid = child.pid;
  if (typeof pid !== "number" || !Number.isInteger(pid) || pid <= 0) {
    child.kill("SIGKILL");
    return;
  }

  await new Promise<void>((resolve) => {
    let taskkill: ChildProcess | undefined;
    let settled = false;
    const finish = (): void => {
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
      taskkill = spawnProcess("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
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
