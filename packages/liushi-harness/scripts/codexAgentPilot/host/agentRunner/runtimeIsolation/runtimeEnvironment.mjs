import process from "node:process";

import { validateCodexAgentRuntimePlan } from "./runtimePlan.mjs";

export const CODEX_AGENT_ENVIRONMENT_POLICY_VERSION =
  "liushi.codex-agent-pilot.environment-policy.v1";
export const CODEX_AGENT_ENVIRONMENT_ALLOWLIST = Object.freeze([
  "PATH",
  "Path",
  "SystemRoot",
  "WINDIR",
  "ComSpec",
  "PATHEXT",
  "PROCESSOR_ARCHITECTURE",
  "PROCESSOR_ARCHITEW6432",
  "NUMBER_OF_PROCESSORS",
  "PROCESSOR_IDENTIFIER",
  "PROCESSOR_LEVEL",
  "PROCESSOR_REVISION",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "NO_PROXY",
  "http_proxy",
  "https_proxy",
  "all_proxy",
  "no_proxy",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
  "NODE_EXTRA_CA_CERTS",
]);

export function createCodexAgentEnvironment(sourceEnv = process.env, plan) {
  const validatedPlan = validateCodexAgentRuntimePlan(plan);
  if (sourceEnv === null || typeof sourceEnv !== "object") {
    throw new TypeError("sourceEnv 必须是对象。");
  }

  const environment = {};
  for (const name of CODEX_AGENT_ENVIRONMENT_ALLOWLIST) {
    if (Object.prototype.hasOwnProperty.call(sourceEnv, name) && sourceEnv[name] !== undefined) {
      environment[name] = sourceEnv[name];
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

function splitHomePath(homePath) {
  const windowsPath = /^([A-Za-z]:)([\\/].*)$/.exec(homePath);
  if (windowsPath !== null) return { drive: windowsPath[1], path: windowsPath[2] };
  return { drive: "", path: homePath };
}
