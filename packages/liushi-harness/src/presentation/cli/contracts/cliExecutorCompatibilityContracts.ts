import type { ContentDigest } from "#common/index.js";

import type { BaseCliCommand, CliCommand } from "./cliCommandContracts.js";

/** Executor Compatibility CLI 当前允许的执行器。 */
export enum CliExecutorCompatibilityExecutor {
  /** OpenAI Codex 执行器。 */
  Codex = "codex",
}

/** 编译 Codex Executor Compatibility Matrix 的 CLI 命令。 */
export interface ExecutorCompatibilityCompileCliCommand extends BaseCliCommand {
  /** 规范命令标识。 */
  readonly command: CliCommand.ExecutorCompatibilityCompile;
  /** 当前唯一允许编译的执行器。 */
  readonly executor: CliExecutorCompatibilityExecutor;
  /** Host Smoke Prepare Manifest 原始 JSON 文件路径。 */
  readonly prepareFilePath: string;
  /** Human Activation Plan 原始 JSON 文件路径。 */
  readonly activationFilePath: string;
  /** Host Result 原始 JSON 文件路径。 */
  readonly resultFilePath: string;
}

/** 按精确 Matrix Digest 查询 Executor Compatibility 的 CLI 命令。 */
export interface ExecutorCompatibilityQueryCliCommand extends BaseCliCommand {
  /** 规范命令标识。 */
  readonly command: CliCommand.ExecutorCompatibilityQuery;
  /** 精确、小写的 SHA-256 Matrix Digest。 */
  readonly matrixDigest: ContentDigest;
}
