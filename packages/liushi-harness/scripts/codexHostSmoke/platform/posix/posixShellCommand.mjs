import { assertShellCommandArgument } from "../common/index.mjs";

export function createPosixShellCommand(arguments_) {
  return arguments_.map(quotePosixArgument).join(" ");
}

function quotePosixArgument(value) {
  assertShellCommandArgument(value);
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}
