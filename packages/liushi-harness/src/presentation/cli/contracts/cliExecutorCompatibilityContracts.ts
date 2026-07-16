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

/** 创建并原子发布 Executor Compatibility Bundle 的 CLI 命令。 */
export interface ExecutorCompatibilityBundleCreateCliCommand extends BaseCliCommand {
  /** 规范命令标识。 */
  readonly command: CliCommand.ExecutorCompatibilityBundleCreate;
  /** 调用方明确选择的 Matrix Digest。 */
  readonly matrixDigest: ContentDigest;
  /** npm 包名。 */
  readonly packageName: string;
  /** 精确 npm 包版本。 */
  readonly packageVersion: string;
  /** 实际 npm Tarball 的内容摘要。 */
  readonly packageDigest: ContentDigest;
  /** 规范 HTTPS 源码仓库 URI。 */
  readonly repositoryUri: string;
  /** 发布物对应的完整 Git Revision。 */
  readonly sourceRevision: string;
  /** 不允许覆盖的规范绝对输出路径。 */
  readonly outputFilePath: string;
}
