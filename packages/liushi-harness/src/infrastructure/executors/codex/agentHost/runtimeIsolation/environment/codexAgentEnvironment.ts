import process from "node:process";

import {
  CODEX_AGENT_ENVIRONMENT_ALLOWLIST,
  CODEX_AGENT_ENVIRONMENT_POLICY_VERSION,
} from "../constants/index.js";
import type { CodexAgentRuntimePlan } from "../contracts/index.js";
import { validateCodexAgentRuntimePlan } from "../plan/index.js";

export { CODEX_AGENT_ENVIRONMENT_ALLOWLIST, CODEX_AGENT_ENVIRONMENT_POLICY_VERSION };

/** 按固定白名单创建 Codex Agent 环境，并覆盖所有 Runtime 路径变量。 */
export function createCodexAgentEnvironment(
  sourceEnv: Readonly<Record<string, string | undefined>> = process.env,
  plan: CodexAgentRuntimePlan,
): Readonly<Record<string, string>> {
  const validatedPlan = validateCodexAgentRuntimePlan(plan);
  if (sourceEnv === null || typeof sourceEnv !== "object") {
    throw new TypeError("sourceEnv 必须是对象。");
  }

  const environment: Record<string, string> = {};
  for (const name of CODEX_AGENT_ENVIRONMENT_ALLOWLIST) {
    const ownsName = Object.prototype.hasOwnProperty.call(sourceEnv, name);
    const value = ownsName ? sourceEnv[name] : undefined;
    if (ownsName && value !== undefined) {
      environment[name] = value;
    }
  }

  const homeParts = splitHomePath(validatedPlan.profileHome);
  return {
    ...environment,
    CODEX_HOME: validatedPlan.codexHome,
    CODEX_SQLITE_HOME: validatedPlan.sqliteHome,
    TEMP: validatedPlan.tempHome,
    TMP: validatedPlan.tempHome,
    TMPDIR: validatedPlan.tempHome,
    HOME: validatedPlan.profileHome,
    USERPROFILE: validatedPlan.profileHome,
    HOMEDRIVE: homeParts.drive,
    HOMEPATH: homeParts.path,
    NO_UPDATE_NOTIFIER: "1",
  };
}

function splitHomePath(homePath: string): { drive: string; path: string } {
  const windowsPath = /^([A-Za-z]:)([\\/].*)$/.exec(homePath);
  if (windowsPath !== null) {
    return {
      drive: windowsPath[1] ?? "",
      path: windowsPath[2] ?? homePath,
    };
  }

  return { drive: "", path: homePath };
}
