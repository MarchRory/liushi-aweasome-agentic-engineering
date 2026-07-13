import { isDeepStrictEqual } from "node:util";

const ALLOWED_COMMAND_PREFIXES = [
  ["task", "create"],
  ["artifact", "propose"],
  ["approval", "decide"],
  ["hook", "probe"],
  ["hook", "config"],
];

export function runCodexHostSmokeCommand(runner, consumerRoot, args) {
  assertCodexHostSmokeCommand(args);
  return runner(consumerRoot, args);
}

export function assertCodexHostSmokeCommand(args) {
  if (
    !Array.isArray(args) ||
    args.length < 2 ||
    args.some((value) => typeof value !== "string" || value.includes("\0"))
  ) {
    throw new Error("Codex Host Smoke Prepare 命令必须是无 NUL 的字符串参数数组。");
  }
  const prefix = args.slice(0, 2);
  if (!ALLOWED_COMMAND_PREFIXES.some((allowed) => isDeepStrictEqual(prefix, allowed))) {
    throw new Error(`Codex Host Smoke Prepare 拒绝执行命令：${prefix.join(" ")}。`);
  }
}
