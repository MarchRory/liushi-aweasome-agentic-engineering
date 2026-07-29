import process from "node:process";
import { resolve } from "node:path";

import {
  CODEX_PREFLIGHT_ENVIRONMENT_NAMES,
  CODEX_PREFLIGHT_LOOPBACK_NO_PROXY,
} from "./preflightConstants.mjs";

export function createCodexPreflightEnvironment(input) {
  const sourceEnvironment = input?.sourceEnvironment ?? process.env;
  requireRecord(sourceEnvironment, "preflight source environment");

  const environment = {};
  for (const name of CODEX_PREFLIGHT_ENVIRONMENT_NAMES) {
    if (
      Object.prototype.hasOwnProperty.call(sourceEnvironment, name) &&
      typeof sourceEnvironment[name] === "string"
    ) {
      environment[name] = sourceEnvironment[name];
    }
  }

  const codexHome = requireAbsolutePath(input?.codexHome, "CODEX_HOME");
  const sqliteHome = requireAbsolutePath(input?.sqliteHome, "CODEX_SQLITE_HOME");
  const profileHome = requireAbsolutePath(input?.profileHome, "HOME");
  const tempHome = requireAbsolutePath(input?.tempHome, "TEMP");
  const homeParts = splitHomePath(profileHome);

  return {
    ...environment,
    CODEX_HOME: codexHome,
    CODEX_SQLITE_HOME: sqliteHome,
    HOME: profileHome,
    USERPROFILE: profileHome,
    HOMEDRIVE: homeParts.drive,
    HOMEPATH: homeParts.path,
    TEMP: tempHome,
    TMP: tempHome,
    TMPDIR: tempHome,
    NO_UPDATE_NOTIFIER: "1",
    HTTP_PROXY: "",
    HTTPS_PROXY: "",
    ALL_PROXY: "",
    http_proxy: "",
    https_proxy: "",
    all_proxy: "",
    NO_PROXY: CODEX_PREFLIGHT_LOOPBACK_NO_PROXY,
    no_proxy: CODEX_PREFLIGHT_LOOPBACK_NO_PROXY,
  };
}

function splitHomePath(homePath) {
  const windowsPath = /^([A-Za-z]:)([\\/].*)$/u.exec(homePath);
  if (windowsPath !== null) return { drive: windowsPath[1], path: windowsPath[2] };
  return { drive: "", path: homePath };
}

function requireAbsolutePath(value, label) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
    throw new TypeError(`${label} must be a non-empty path without NUL`);
  }
  const normalized = resolve(value);
  if (normalized !== value && !/^[A-Za-z]:[\\/]/u.test(value)) {
    throw new TypeError(`${label} must be absolute`);
  }
  return value;
}

function requireRecord(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
}
