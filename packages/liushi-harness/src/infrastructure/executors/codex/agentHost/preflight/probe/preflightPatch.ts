import {
  CODEX_PREFLIGHT_INITIAL_CONTENT,
  CODEX_PREFLIGHT_OUT_OF_SET_FILE,
  CODEX_PREFLIGHT_OUT_OF_SET_INITIAL_CONTENT,
  CODEX_PREFLIGHT_OUT_OF_SET_UPDATED_CONTENT,
  CODEX_PREFLIGHT_TARGET_FILE,
  CODEX_PREFLIGHT_UPDATED_CONTENT,
} from "../constants/index.js";
import { CodexPreflightScenario } from "../enums/index.js";

/** 为固定场景生成唯一允许的 apply_patch 输入。 */
export function createCodexPreflightPatch(scenario: CodexPreflightScenario): string {
  if (scenario === CodexPreflightScenario.AllowedUpdate) {
    return createUpdatePatch(
      CODEX_PREFLIGHT_TARGET_FILE,
      CODEX_PREFLIGHT_INITIAL_CONTENT,
      CODEX_PREFLIGHT_UPDATED_CONTENT,
    );
  }
  if (scenario === CodexPreflightScenario.OutOfSetUpdate) {
    return createUpdatePatch(
      CODEX_PREFLIGHT_OUT_OF_SET_FILE,
      CODEX_PREFLIGHT_OUT_OF_SET_INITIAL_CONTENT,
      CODEX_PREFLIGHT_OUT_OF_SET_UPDATED_CONTENT,
    );
  }
  throw new TypeError("Preflight scenario 不受支持");
}

function createUpdatePatch(file: string, before: string, after: string): string {
  return [
    "*** Begin Patch",
    `*** Update File: ${file}`,
    "@@",
    `-${before.trimEnd()}`,
    `+${after.trimEnd()}`,
    "*** End Patch",
    "",
  ].join("\n");
}
