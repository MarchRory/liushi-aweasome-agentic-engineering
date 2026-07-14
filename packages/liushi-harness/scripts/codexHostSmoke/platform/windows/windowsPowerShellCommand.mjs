import { assertShellCommandArgument } from "../common/index.mjs";

export function createWindowsPowerShellCommand(arguments_) {
  const command = arguments_.map(quotePowerShellArgument).join(" ");
  // Codex 将 Windows Hook 交给 PowerShell -Command，带引号的可执行路径必须显式调用。
  return `& ${command}`;
}

function quotePowerShellArgument(value) {
  assertShellCommandArgument(value);
  return `'${value.replaceAll("'", "''")}'`;
}
