import { CODEX_PREFLIGHT_VERSION } from "../constants/index.js";
import type { CodexAppServerPreflightConfig } from "../contracts/index.js";
import { requireDigest, requirePlainRecord } from "../evidence/index.js";
import { isCodexPreflightAbsolutePath, sameCodexPreflightPath } from "../platform/index.js";

const INPUT_KEYS = new Set([
  "executable",
  "codexExecutable",
  "codexExecutableDigest",
  "codexVersion",
  "model",
  "sourceEnvironment",
]);

/** 校验并冻结零模型 Preflight 的外部输入。 */
export function validateCodexAppServerPreflightInput(
  input: unknown,
): CodexAppServerPreflightConfig {
  requirePlainRecord(input, "preflight input");
  for (const key of Object.keys(input)) {
    if (!INPUT_KEYS.has(key)) throw new Error(`preflight input 包含未知字段 ${key}`);
  }

  const executable = selectExecutable(input);
  requireDigest(input["codexExecutableDigest"], "codexExecutableDigest");
  if (input["codexVersion"] !== CODEX_PREFLIGHT_VERSION) {
    throw new Error(`Preflight 只支持 ${CODEX_PREFLIGHT_VERSION}`);
  }
  const model = requireText(input["model"], "model");
  const sourceEnvironment = input["sourceEnvironment"];
  if (sourceEnvironment !== undefined) {
    requirePlainRecord(sourceEnvironment, "sourceEnvironment");
  }

  return Object.freeze({
    executable,
    codexExecutableDigest: input["codexExecutableDigest"],
    codexVersion: input["codexVersion"],
    model,
    ...(sourceEnvironment === undefined
      ? {}
      : {
          sourceEnvironment: sourceEnvironment as Readonly<Record<string, string | undefined>>,
        }),
  }) satisfies CodexAppServerPreflightConfig;
}

function selectExecutable(input: Record<string, unknown>): string {
  const executable = input["executable"];
  const alias = input["codexExecutable"];
  if (executable !== undefined && alias !== undefined) {
    const primary = requireExecutable(executable);
    const secondary = requireExecutable(alias);
    if (!sameCodexPreflightPath(primary, secondary)) {
      throw new Error("executable 与 codexExecutable 不得冲突");
    }
    return primary;
  }
  return requireExecutable(executable ?? alias);
}

function requireExecutable(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.includes("\0") ||
    !isCodexPreflightAbsolutePath(value)
  ) {
    throw new TypeError("Preflight executable 必须是无 NUL 的绝对路径");
  }
  return value;
}

function requireText(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value !== value.trim() ||
    [...value].some((character) => {
      const code = character.codePointAt(0)!;
      return code < 32 || code === 127;
    })
  ) {
    throw new TypeError(`${label} 必须是无控制字符的非空文本`);
  }
  return value;
}
