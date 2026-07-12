import { spawn } from "node:child_process";
import { success, type HarnessError, type Result } from "#common/index.js";
import type {
  CommandRunRequest,
  CommandRunResult,
  CommandRunner,
} from "./commandRunner.contracts.js";

/** 基于 Node spawn 的非 shell 外部命令执行器。 */
export class NodeCommandRunnerAdapter implements CommandRunner {
  /** 执行命令并结构化收集退出码、输出和启动错误。 */
  public run(request: CommandRunRequest): Promise<Result<CommandRunResult, HarnessError>> {
    return new Promise<Result<CommandRunResult, HarnessError>>((resolve) => {
      let stdout = "";
      let stderr = "";
      let child: ReturnType<typeof spawn>;
      try {
        child = spawn(request.executable, [...request.args], {
          shell: false,
          cwd: request.cwd,
          windowsHide: true,
          env: request.environment === undefined ? process.env : { ...request.environment },
        });
      } catch (error) {
        resolve(
          success({
            exitCode: null,
            stdout,
            stderr,
            launchError: getLaunchError(error),
          }),
        );
        return;
      }
      let settled = false;
      let terminalError: string | undefined;
      const finish = (value: Result<CommandRunResult, HarnessError>): void => {
        if (!settled) {
          settled = true;
          resolve(value);
        }
      };
      const timer = setTimeout(() => {
        terminalError = "timeout";
        child.kill();
      }, request.timeoutMs);
      child.stdout?.on("data", (chunk: Buffer) => {
        if (terminalError !== undefined) return;
        if (appendOutput(chunk, request.maxOutputBytes, stdout, stderr)) {
          stdout += chunk.toString();
        } else {
          terminalError = "output_limit";
          child.kill();
          clearTimeout(timer);
        }
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        if (terminalError !== undefined) return;
        if (appendOutput(chunk, request.maxOutputBytes, stdout, stderr)) {
          stderr += chunk.toString();
        } else {
          terminalError = "output_limit";
          child.kill();
          clearTimeout(timer);
        }
      });
      child.on("error", (error: NodeJS.ErrnoException) => {
        clearTimeout(timer);
        finish(
          success({
            exitCode: null,
            stdout,
            stderr,
            launchError: terminalError ?? error.code ?? "spawn_error",
          }),
        );
      });
      child.on("close", (exitCode) => {
        clearTimeout(timer);
        finish(
          success(
            terminalError === undefined
              ? { exitCode, stdout, stderr }
              : { exitCode: null, stdout, stderr, launchError: terminalError },
          ),
        );
      });
    });
  }
}

function appendOutput(
  chunk: Buffer,
  maxOutputBytes: number | undefined,
  stdout: string,
  stderr: string,
): boolean {
  return (
    maxOutputBytes === undefined ||
    Buffer.byteLength(stdout) + Buffer.byteLength(stderr) + chunk.byteLength <= maxOutputBytes
  );
}

function getLaunchError(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = error.code;
    return typeof code === "string" ? code : "spawn_error";
  }
  return "spawn_error";
}
