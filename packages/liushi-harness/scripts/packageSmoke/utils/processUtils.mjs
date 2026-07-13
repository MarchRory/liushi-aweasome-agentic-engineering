import { spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import process from "node:process";

export function runProcess(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    env: { ...process.env, NO_UPDATE_NOTIFIER: "1" },
    windowsHide: true,
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      [
        `命令执行失败：${command} ${args.join(" ")}`,
        `退出码：${String(result.status)}`,
        result.stdout.trim(),
        result.stderr.trim(),
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  return { stdout: result.stdout, stderr: result.stderr };
}

export function resolveNpmCliPath() {
  const npmCliRelativePath = join("node_modules", "npm", "bin", "npm-cli.js");
  const executableRoot = dirname(process.execPath);
  const candidates = [
    process.env.NPM_CLI_JS_PATH,
    join(executableRoot, npmCliRelativePath),
    join(dirname(executableRoot), "lib", npmCliRelativePath),
  ];
  for (const pathEntry of (process.env.PATH ?? "").split(delimiter).filter(Boolean)) {
    candidates.push(
      join(pathEntry, npmCliRelativePath),
      join(pathEntry, "..", "lib", npmCliRelativePath),
    );
    const launcher = join(pathEntry, process.platform === "win32" ? "npm.cmd" : "npm");
    if (existsSync(launcher)) {
      const resolved = realpathSync(launcher);
      if (resolved.endsWith(".js")) candidates.push(resolved);
    }
  }
  const resolved = [...new Set(candidates.filter(Boolean))].find((candidate) =>
    existsSync(candidate),
  );
  if (resolved === undefined) throw new Error("无法定位当前 Node.js 安装附带的 npm CLI。");
  return resolved;
}
