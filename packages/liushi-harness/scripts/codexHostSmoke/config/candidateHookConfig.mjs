import { isDeepStrictEqual } from "node:util";

const EXPECTED_EVENTS = ["PreToolUse", "PostToolUse"];
const EXPECTED_MATCHER = "^apply_patch$";

export function createCandidateHookConfig(input) {
  assertProjectionShape(input.projection);
  const command = createPosixCommand(input);
  const commandWindows = createWindowsCommand(input);
  const candidate = globalThis.structuredClone(input.projection);
  for (const event of EXPECTED_EVENTS) {
    candidate.hooks[event][0].hooks[0].command = command;
    candidate.hooks[event][0].hooks[0].commandWindows = commandWindows;
  }
  assertProjectionShape(candidate);
  return candidate;
}

function createPosixCommand(input) {
  return commandArguments(input).map(quotePosixArgument).join(" ");
}

function createWindowsCommand(input) {
  return commandArguments(input).map(quoteWindowsArgument).join(" ");
}

function commandArguments(input) {
  return [
    input.nodeExecutable,
    input.cliEntrypoint,
    "hook",
    "handle",
    "--executor",
    "codex",
    "--store",
    input.storeRoot,
  ];
}

function quotePosixArgument(value) {
  assertCommandArgument(value);
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function quoteWindowsArgument(value) {
  assertCommandArgument(value);
  if (value.includes('"')) {
    throw new Error("Windows Hook 命令参数不能包含双引号。");
  }
  return `"${value}"`;
}

function assertCommandArgument(value) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
    throw new Error("Hook 命令参数必须是非空无 NUL 字符串。");
  }
}

function assertProjectionShape(projection) {
  if (!isRecord(projection) || !isRecord(projection.hooks)) {
    throw new Error("Codex Hook Projection 缺少 hooks 对象。");
  }
  const actualEvents = Object.keys(projection.hooks).sort();
  if (!isDeepStrictEqual(actualEvents, [...EXPECTED_EVENTS].sort())) {
    throw new Error("Codex Hook Projection 事件集合不符合固定约束。");
  }
  for (const event of EXPECTED_EVENTS) {
    const groups = projection.hooks[event];
    const group = Array.isArray(groups) ? groups[0] : undefined;
    const handler = Array.isArray(group?.hooks) ? group.hooks[0] : undefined;
    if (
      !Array.isArray(groups) ||
      groups.length !== 1 ||
      group?.matcher !== EXPECTED_MATCHER ||
      group?.hooks?.length !== 1 ||
      handler?.type !== "command" ||
      typeof handler.command !== "string" ||
      typeof handler.commandWindows !== "string" ||
      typeof handler.statusMessage !== "string"
    ) {
      throw new Error(`${event} Hook Projection 不符合固定 command Handler 约束。`);
    }
  }
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
