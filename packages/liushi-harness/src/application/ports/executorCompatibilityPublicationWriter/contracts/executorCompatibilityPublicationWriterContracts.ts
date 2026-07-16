import type { ContentDigest, HarnessError, Result } from "#common/index.js";
import type { ExecutorCompatibilityPublicationBundle } from "#domain/executorCompatibilityPublication/index.js";

import type { EXECUTOR_COMPATIBILITY_PUBLICATION_WRITE_RESULT_SCHEMA_VERSION } from "../constants/index.js";
import type { ExecutorCompatibilityPublicationWriteDisposition } from "../enums/index.js";

/** 向不可变文件发布已复验 Bundle 的输入。 */
export interface WriteExecutorCompatibilityPublicationBundleInput {
  /** 已完成摘要绑定并通过领域校验的 Bundle。 */
  readonly bundle: ExecutorCompatibilityPublicationBundle;
  /** 调用方明确指定的规范绝对输出路径。 */
  readonly outputFilePath: string;
}

/** 不暴露完整 Evidence 的 Publication Bundle 写入回执。 */
export interface ExecutorCompatibilityPublicationWriteResult {
  /** 写入回执契约版本。 */
  readonly schemaVersion: typeof EXECUTOR_COMPATIBILITY_PUBLICATION_WRITE_RESULT_SCHEMA_VERSION;
  /** 首次创建或完全相同内容的幂等复用。 */
  readonly disposition: ExecutorCompatibilityPublicationWriteDisposition;
  /** 实际写入或复用的规范绝对路径。 */
  readonly outputFilePath: string;
  /** 完整 Publication Bundle 的内容摘要。 */
  readonly bundleDigest: ContentDigest;
  /** Bundle 绑定的 Matrix 摘要。 */
  readonly matrixDigest: ContentDigest;
  /** Bundle 绑定的 npm Tarball 摘要。 */
  readonly packageDigest: ContentDigest;
  /** Bundle 绑定的 npm 包名。 */
  readonly packageName: string;
  /** Bundle 绑定的精确 npm 包版本。 */
  readonly packageVersion: string;
  /** 规范 JSON 文件的 UTF-8 字节数。 */
  readonly byteLength: number;
}

/** Publication Bundle 不可变文件写入边界。 */
export interface ExecutorCompatibilityPublicationWriterPort {
  /** 原子创建目标；完全相同内容允许幂等复用，不覆盖任何既有文件。 */
  write(
    input: WriteExecutorCompatibilityPublicationBundleInput,
  ): Promise<Result<ExecutorCompatibilityPublicationWriteResult, HarnessError>>;
}
