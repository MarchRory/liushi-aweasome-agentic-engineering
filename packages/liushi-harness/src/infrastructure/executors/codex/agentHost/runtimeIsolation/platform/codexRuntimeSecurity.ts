import process from "node:process";

import type {
  CodexAgentRuntimeSecurityOverrides,
  WindowsRuntimeSecurityResult,
} from "../contracts/index.js";
import { securePosixRuntimeDirectory } from "./posixRuntimeSecurity.js";
import { secureWindowsRuntimeDirectory } from "./windowsRuntimeSecurity.js";

/** 按运行平台选择 Runtime 目录安全策略。 */
export async function secureCodexAgentRuntimeDirectory(
  root: string,
  overrides: CodexAgentRuntimeSecurityOverrides = {},
): Promise<WindowsRuntimeSecurityResult | void> {
  const platform = overrides.platform ?? process.platform;
  if (platform === "win32") {
    return secureWindowsRuntimeDirectory(root, overrides);
  }

  return securePosixRuntimeDirectory(root, overrides);
}
