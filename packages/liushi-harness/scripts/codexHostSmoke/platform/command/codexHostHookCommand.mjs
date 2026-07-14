import { createPosixShellCommand } from "../posix/index.mjs";
import { createWindowsPowerShellCommand } from "../windows/index.mjs";

export function createCodexHostHookCommands(input) {
  const arguments_ = [
    input.nodeExecutable,
    input.cliEntrypoint,
    "hook",
    "handle",
    "--executor",
    "codex",
    "--store",
    input.storeRoot,
  ];
  return {
    command: createPosixShellCommand(arguments_),
    commandWindows: createWindowsPowerShellCommand(arguments_),
  };
}
