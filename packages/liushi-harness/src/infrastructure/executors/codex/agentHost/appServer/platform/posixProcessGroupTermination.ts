import process from "node:process";

import type { ChildProcessWithoutNullStreams } from "node:child_process";

/** 在 POSIX 平台向独立进程组发送强制终止信号。 */
export function terminatePosixProcessGroup(child: ChildProcessWithoutNullStreams): void {
  const pid = child.pid;
  try {
    if (typeof pid === "number" && Number.isInteger(pid) && pid > 0) {
      process.kill(-pid, "SIGKILL");
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
