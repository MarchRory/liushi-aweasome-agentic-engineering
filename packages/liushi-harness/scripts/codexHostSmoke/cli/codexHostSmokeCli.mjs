import { isAbsolute, resolve } from "node:path";

const PREPARE_COMMAND = "prepare";
const ROOT_OPTION = "--root";
const CODEX_OPTION = "--codex";
const ALLOWED_OPTIONS = new Set([ROOT_OPTION, CODEX_OPTION]);

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
    values.set(option, normalizeAbsolutePath(value, option));
  }
  const root = values.get(ROOT_OPTION);
  const codexExecutable = values.get(CODEX_OPTION);
  if (root === undefined || codexExecutable === undefined) {
    throw new Error("prepare 必须同时提供 --root 和 --codex。");
  }
  return { command: PREPARE_COMMAND, root, codexExecutable };
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
