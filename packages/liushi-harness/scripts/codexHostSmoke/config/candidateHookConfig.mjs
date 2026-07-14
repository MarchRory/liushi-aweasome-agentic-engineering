import { isDeepStrictEqual } from "node:util";

import { createCodexHostHookCommands } from "../platform/index.mjs";

const EXPECTED_EVENTS = ["PreToolUse", "PostToolUse"];
const EXPECTED_MATCHER = "^apply_patch$";

export function createCandidateHookConfig(input) {
  assertProjectionShape(input.projection);
  const commands = createCodexHostHookCommands(input);
  const candidate = globalThis.structuredClone(input.projection);
  for (const event of EXPECTED_EVENTS) {
    candidate.hooks[event][0].hooks[0].command = commands.command;
    candidate.hooks[event][0].hooks[0].commandWindows = commands.commandWindows;
  }
  assertProjectionShape(candidate);
  return candidate;
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
