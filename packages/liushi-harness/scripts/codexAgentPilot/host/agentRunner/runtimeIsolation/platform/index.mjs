import process from "node:process";

import { securePosixRuntimeDirectory } from "./posixRuntimeSecurity.mjs";
import { parseWindowsUserSid, secureWindowsRuntimeDirectory } from "./windowsRuntimeSecurity.mjs";

export async function secureCodexAgentRuntimeDirectory(root, overrides = {}) {
  const platform = overrides.platform ?? process.platform;
  if (platform === "win32") return secureWindowsRuntimeDirectory(root, overrides);
  return securePosixRuntimeDirectory(root, overrides);
}

export { parseWindowsUserSid, securePosixRuntimeDirectory, secureWindowsRuntimeDirectory };
