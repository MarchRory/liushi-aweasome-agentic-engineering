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
      const finish = (value: Result<CommandRunResult, HarnessError>): void => {
        if (!settled) {
          settled = true;
          resolve(value);
        }
      };
      const timer = setTimeout(() => {
        child.kill();
        finish(success({ exitCode: null, stdout, stderr, launchError: "timeout" }));
      }, request.timeoutMs);
      child.stdout?.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on("error", (error: NodeJS.ErrnoException) => {
        clearTimeout(timer);
        finish(
          success({ exitCode: null, stdout, stderr, launchError: error.code ?? "spawn_error" }),
        );
      });
      child.on("close", (exitCode) => {
        clearTimeout(timer);
        finish(success({ exitCode, stdout, stderr }));
      });
    });
  }
}

function getLaunchError(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = error.code;
    return typeof code === "string" ? code : "spawn_error";
  }
  return "spawn_error";
}
