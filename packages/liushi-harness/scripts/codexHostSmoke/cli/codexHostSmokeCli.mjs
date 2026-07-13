import { isAbsolute, resolve } from "node:path";

const PREPARE_COMMAND = "prepare";
const ROOT_OPTION = "--root";
const CODEX_OPTION = "--codex";
const CODEX_HOME_OPTION = "--codex-home";
const MODEL_OPTION = "--model";
const ACTOR_ID_OPTION = "--actor-id";
const PATH_OPTIONS = new Set([ROOT_OPTION, CODEX_OPTION, CODEX_HOME_OPTION]);
const TEXT_OPTIONS = new Set([MODEL_OPTION, ACTOR_ID_OPTION]);
const ALLOWED_OPTIONS = new Set([...PATH_OPTIONS, ...TEXT_OPTIONS]);

export function parseCodexHostSmokeArguments(args) {
  if (args[0] !== PREPARE_COMMAND) {
    throw new Error("Codex Host Smoke 仅支持 prepare 命令。");
  }
  const optionStartIndex = args[1] === "--" ? 2 : 1;
  const values = new Map();
  for (let index = optionStartIndex; index < args.length; index += 2) {
    const option = args[index];
    const value = args[index + 1];
    if (!ALLOWED_OPTIONS.has(option)) {
      throw new Error(`未知 Codex Host Smoke 选项：${String(option)}。`);
    }
    if (values.has(option)) {
      throw new Error(`Codex Host Smoke 选项不能重复：${option}。`);
    }
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Codex Host Smoke 选项缺少值：${option}。`);
    }
    values.set(
      option,
      PATH_OPTIONS.has(option)
        ? normalizeAbsolutePath(value, option)
        : normalizeText(value, option),
    );
  }
  const root = values.get(ROOT_OPTION);
  const codexExecutable = values.get(CODEX_OPTION);
  const codexHome = values.get(CODEX_HOME_OPTION);
  const model = values.get(MODEL_OPTION);
  const actorId = values.get(ACTOR_ID_OPTION);
  if (
    root === undefined ||
    codexExecutable === undefined ||
    codexHome === undefined ||
    model === undefined ||
    actorId === undefined
  ) {
    throw new Error("prepare 必须同时提供 --root、--codex、--codex-home、--model 和 --actor-id。");
  }
  return { command: PREPARE_COMMAND, root, codexExecutable, codexHome, model, actorId };
}

function normalizeAbsolutePath(value, option) {
  if (value.includes("\0")) {
    throw new Error(`${option} 不能包含 NUL。`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || !isAbsolute(trimmed)) {
    throw new Error(`${option} 必须是非空绝对路径。`);
  }
  return resolve(trimmed);
}

function normalizeText(value, option) {
  const trimmed = value.trim();
  if (
    trimmed.length === 0 ||
    trimmed.length > 128 ||
    trimmed.includes("\0") ||
    !/^[A-Za-z0-9._:@/-]+$/u.test(trimmed)
  ) {
    throw new Error(`${option} 必须是长度不超过 128 的安全标识。`);
  }
  return trimmed;
}
