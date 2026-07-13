import { spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import process from "node:process";

const ERROR_OUTPUT_LIMIT = 4_000;

export function runProcess(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    env: { ...process.env, NO_UPDATE_NOTIFIER: "1", ...options.env },
    input: options.input,
    maxBuffer: options.maxBuffer,
    timeout: options.timeout,
    windowsHide: true,
    shell: false,
  });
  if (result.error !== undefined) {
    throw new Error(`命令无法启动：${basenameForError(command)}。`, { cause: result.error });
  }
  if (result.status !== 0) {
    throw new Error(
      [
        `命令执行失败：${basenameForError(command)}。`,
        `退出码：${String(result.status)}`,
        summarizeOutput("stdout", result.stdout),
        summarizeOutput("stderr", result.stderr),
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  return { stdout: result.stdout, stderr: result.stderr };
}

export function resolveNpmCliPath() {
  return resolveNodeCliPath({
    environmentPath: process.env.NPM_CLI_JS_PATH,
    relativePaths: [
      join("node_modules", "npm", "bin", "npm-cli.js"),
      join("lib", "node_modules", "npm", "bin", "npm-cli.js"),
    ],
    displayName: "npm CLI",
  });
}

export function resolveCorepackCliPath() {
  return resolveNodeCliPath({
    environmentPath: process.env.COREPACK_CLI_JS_PATH,
    relativePaths: [
      join("node_modules", "corepack", "dist", "corepack.js"),
      join("lib", "node_modules", "corepack", "dist", "corepack.js"),
    ],
    displayName: "Corepack CLI",
  });
}

function resolveNodeCliPath(input) {
  const executableRoot = dirname(process.execPath);
  const candidates = [input.environmentPath];
  for (const relativePath of input.relativePaths) {
    candidates.push(
      join(executableRoot, relativePath),
      join(dirname(executableRoot), relativePath),
    );
    for (const pathEntry of (process.env.PATH ?? "").split(delimiter).filter(Boolean)) {
      candidates.push(join(pathEntry, relativePath), join(pathEntry, "..", relativePath));
    }
  }
  const resolved = [...new Set(candidates.filter(Boolean))].find(
    (candidate) => candidate.endsWith(".js") && existsSync(candidate),
  );
  if (resolved === undefined)
    throw new Error(`无法定位当前 Node.js 安装附带的 ${input.displayName}。`);
  return realpathSync(resolved);
}

function basenameForError(command) {
  return command.replaceAll("\\", "/").split("/").at(-1) ?? "unknown";
}

function summarizeOutput(label, value) {
  const normalized = value.trim();
  if (normalized.length === 0) return "";
  const suffix = normalized.length > ERROR_OUTPUT_LIMIT ? "\n……输出已截断。" : "";
  return `${label}：\n${normalized.slice(0, ERROR_OUTPUT_LIMIT)}${suffix}`;
}
