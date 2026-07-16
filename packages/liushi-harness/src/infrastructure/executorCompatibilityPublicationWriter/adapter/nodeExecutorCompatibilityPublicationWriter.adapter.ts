import { isAbsolute, resolve } from "node:path";

import {
  EXECUTOR_COMPATIBILITY_PUBLICATION_WRITE_RESULT_SCHEMA_VERSION,
  type ExecutorCompatibilityPublicationWriterPort,
  type ExecutorCompatibilityPublicationWriteResult,
  type WriteExecutorCompatibilityPublicationBundleInput,
} from "#application/ports/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import { validateExecutorCompatibilityPublicationBundle } from "#domain/executorCompatibilityPublication/index.js";
import type { ExecutorCompatibilityPublicationDigestPort } from "#domain/executorCompatibilityPublication/index.js";
import type { ParentDirectoryDurability } from "#infrastructure/persistence/fileEventStore/index.js";
import { canonicalizeJson } from "#infrastructure/serialization/index.js";

import { createAtomicExecutorCompatibilityPublicationFile } from "../io/index.js";

/** 使用跨平台 Node 文件系统原语发布规范化不可变 Bundle。 */
export class NodeExecutorCompatibilityPublicationWriterAdapter implements ExecutorCompatibilityPublicationWriterPort {
  public constructor(
    private readonly digest: ExecutorCompatibilityPublicationDigestPort,
    private readonly parentDirectoryDurability: ParentDirectoryDurability,
  ) {}

  /** 拒绝相对路径和摘要漂移，再以 create-only 原子语义发布规范 JSON。 */
  public async write(
    input: WriteExecutorCompatibilityPublicationBundleInput,
  ): Promise<Result<ExecutorCompatibilityPublicationWriteResult, HarnessError>> {
    const validated = validateExecutorCompatibilityPublicationBundle(input.bundle, this.digest);
    if (validated.status === ResultStatus.Failure) return validated;
    if (!isAbsolute(input.outputFilePath)) {
      return failure(
        new HarnessError(
          HarnessErrorCode.InvalidInput,
          "Executor compatibility publication output must be an absolute path.",
          { outputFilePath: input.outputFilePath },
        ),
      );
    }

    const outputFilePath = resolve(input.outputFilePath);
    try {
      const content = `${canonicalizeJson(validated.value)}\n`;
      const disposition = await createAtomicExecutorCompatibilityPublicationFile({
        outputFilePath,
        content,
        parentDirectoryDurability: this.parentDirectoryDurability,
      });
      return success({
        schemaVersion: EXECUTOR_COMPATIBILITY_PUBLICATION_WRITE_RESULT_SCHEMA_VERSION,
        disposition,
        outputFilePath,
        bundleDigest: validated.value.bundleDigest,
        matrixDigest: validated.value.matrix.matrixDigest,
        packageDigest: validated.value.releaseSubject.packageDigest,
        packageName: validated.value.releaseSubject.packageName,
        packageVersion: validated.value.releaseSubject.packageVersion,
        byteLength: Buffer.byteLength(content, "utf8"),
      });
    } catch (error) {
      return failure(
        error instanceof HarnessError
          ? error
          : new HarnessError(
              HarnessErrorCode.IoFailure,
              "Unable to publish executor compatibility bundle.",
              { outputFilePath },
              error,
            ),
      );
    }
  }
}
