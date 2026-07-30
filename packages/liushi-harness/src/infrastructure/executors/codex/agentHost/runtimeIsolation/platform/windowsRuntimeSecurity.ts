import { spawnSync } from "node:child_process";

import type {
  RuntimeProcessResult,
  RuntimeProcessRunner,
  WindowsRuntimeSecurityOverrides,
  WindowsRuntimeSecurityResult,
} from "../contracts/index.js";

/** 在 Windows 获取唯一当前 SID，并关闭继承后设置最小 ACL。 */
export async function secureWindowsRuntimeDirectory(
  root: string,
  overrides: WindowsRuntimeSecurityOverrides = {},
): Promise<WindowsRuntimeSecurityResult> {
  const runProcess = overrides.runProcess ?? runSuccessfulProcess;
  const whoamiResult = await runProcess("whoami.exe", ["/user", "/fo", "csv", "/nh"]);
  const sid = parseWindowsUserSid(requireSuccessfulOutput(whoamiResult, "whoami.exe"));
  const icaclsResult = await runProcess("icacls.exe", [
    root,
    "/inheritance:r",
    "/grant:r",
    `*${sid}:(OI)(CI)F`,
    "SYSTEM:(OI)(CI)F",
    "/T",
  ]);
  requireSuccessfulOutput(icaclsResult, "icacls.exe");

  return { sid };
}

/** 从 whoami.exe 输出解析且只接受唯一 SID。 */
export function parseWindowsUserSid(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("whoami.exe 未返回可解析的 SID。");
  }
  const matches = value.match(/\bS-\d-\d+(?:-\d+)+\b/g) ?? [];
  if (matches.length !== 1) {
    throw new Error("whoami.exe 返回的 SID 不唯一。");
  }

  return matches[0];
}

const runSuccessfulProcess: RuntimeProcessRunner = (command, args) => {
  const result = spawnSync(command, [...args], {
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  });
  if (result.error !== undefined) {
    throw new Error(`命令无法启动：${command}。`, { cause: result.error });
  }
  if (result.status !== 0) {
    throw new Error(`命令执行失败：${command}，退出码 ${String(result.status)}。`);
  }

  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.status,
  };
};

function requireSuccessfulOutput(result: RuntimeProcessResult | string, command: string): string {
  if (typeof result === "string") {
    return result;
  }
  if (result.exitCode !== undefined && result.exitCode !== 0) {
    throw new Error(`命令执行失败：${command}，退出码 ${String(result.exitCode)}。`);
  }
  if (typeof result.stdout !== "string") {
    throw new Error(`${command} 未返回标准输出。`);
  }

  return result.stdout;
}
