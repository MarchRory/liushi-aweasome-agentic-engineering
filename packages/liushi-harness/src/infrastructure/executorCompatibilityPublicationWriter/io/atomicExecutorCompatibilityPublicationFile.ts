import {
  createOnlyImmutableFile,
  ImmutableFileParentDirectoryPolicy,
  ImmutableFileWriteDisposition,
} from "#infrastructure/immutableFile/index.js";

import { ExecutorCompatibilityPublicationWriteDisposition } from "#application/ports/index.js";
import { HarnessErrorCode } from "#common/index.js";
import type { ParentDirectoryDurability } from "#infrastructure/persistence/fileEventStore/index.js";

/** Publication Writer 使用的兼容包装，保留既有错误码与回执处置。 */
export interface CreateAtomicExecutorCompatibilityPublicationFileInput {
  /** 完整目标绝对路径。 */
  readonly outputFilePath: string;
  /** 规范 JSON 与单一末尾换行。 */
  readonly content: string;
  /** 父目录耐久化策略。 */
  readonly parentDirectoryDurability: ParentDirectoryDurability;
}

/** 通过通用 immutable-file primitive 发布 Publication Bundle。 */
export async function createAtomicExecutorCompatibilityPublicationFile(
  input: CreateAtomicExecutorCompatibilityPublicationFileInput,
): Promise<ExecutorCompatibilityPublicationWriteDisposition> {
  const disposition = await createOnlyImmutableFile({
    outputFilePath: input.outputFilePath,
    content: Buffer.from(input.content, "utf8"),
    parentDirectoryDurability: input.parentDirectoryDurability,
    parentDirectoryPolicy: ImmutableFileParentDirectoryPolicy.CreateRecursively,
    commitOutcomeUnknownCode: HarnessErrorCode.ExecutorCompatibilityPublicationCommitOutcomeUnknown,
    conflictErrorCode: HarnessErrorCode.PreconditionNotMet,
    artifactName: "Executor compatibility publication",
  });
  return disposition === ImmutableFileWriteDisposition.Created
    ? ExecutorCompatibilityPublicationWriteDisposition.Created
    : ExecutorCompatibilityPublicationWriteDisposition.IdempotentReuse;
}
