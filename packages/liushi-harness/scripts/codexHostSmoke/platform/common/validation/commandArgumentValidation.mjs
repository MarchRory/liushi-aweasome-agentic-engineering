export function assertShellCommandArgument(value) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
    throw new Error("Hook 命令参数必须是非空无 NUL 字符串。");
  }
}
