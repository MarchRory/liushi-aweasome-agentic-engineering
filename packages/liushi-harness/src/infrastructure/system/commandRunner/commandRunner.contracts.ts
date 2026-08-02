import type { HarnessError, Result } from "#common/index.js";

/** 只读外部命令请求。 */
export interface CommandRunRequest {
  /** 可执行文件名。 */
  executable: string;
  /** 命令参数。 */
  args: readonly string[];
  /** 命令运行时的工作目录；不传时沿用当前进程目录。 */
  cwd?: string;
  /** 超时毫秒数。 */
  timeoutMs: number;
  /** 子进程可见的完整环境变量集合；缺失时继承当前进程环境。 */
  environment?: Readonly<Record<string, string>>;
  /** 写入子进程 stdin 的文本；未提供时保持旧行为。 */
  stdin?: string;
  /** stdout 与 stderr 合计允许收集的最大字节数。 */
  maxOutputBytes?: number;
}

/** 外部命令的结构化完成结果。 */
export interface CommandRunResult {
  /** 进程退出码，启动失败时为空。 */
  exitCode: number | null;
  /** 标准输出。 */
  stdout: string;
  /** 标准错误。 */
  stderr: string;
  /** 启动或超时错误的稳定诊断。 */
  launchError?: string;
}

/** Node 外部命令执行端口。 */
export interface CommandRunner {
  /** 以 shell=false 运行一次外部命令。 */
  run(request: CommandRunRequest): Promise<Result<CommandRunResult, HarnessError>>;
}
