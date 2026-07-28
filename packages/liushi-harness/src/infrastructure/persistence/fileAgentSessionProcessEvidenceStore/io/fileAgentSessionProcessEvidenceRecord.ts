import { lstat } from "node:fs/promises";

import type { ContentDigestPort } from "#application/ports/contentDigest/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import {
  rebuildAgentSessionProcessEvidence,
  type AgentSessionProcessEvidence,
} from "#domain/agentSessionProcessEvidence/index.js";
import {
  createOnlyImmutableFile,
  ImmutableFileParentDirectoryPolicy,
  ImmutableFileWriteDisposition,
} from "#infrastructure/immutableFile/index.js";
import type { ParentDirectoryDurability } from "#infrastructure/persistence/fileEventStore/index.js";
import { canonicalizeJson } from "#infrastructure/serialization/index.js";
import {
  StrictJsonCanonicalPolicy,
  readStrictJsonFile,
} from "#infrastructure/strictJsonFileReader/index.js";

/** 检查进程证据文件是否已存在。 */
export async function isAgentSessionProcessEvidenceRecordPresent(
  filePath: string,
): Promise<Result<boolean, HarnessError>> {
  try {
    await lstat(filePath);
    return success(true);
  } catch (error) {
    return isNodeError(error) && error.code === "ENOENT"
      ? success(false)
      : failure(
          new HarnessError(HarnessErrorCode.CorruptStore, "进程证据文件路径不可用。", {}, error),
        );
  }
}

/** 原子创建不可变进程证据文件，并返回是否由本次调用创建。 */
export async function writeAgentSessionProcessEvidenceRecord(
  filePath: string,
  evidence: AgentSessionProcessEvidence,
  parentDirectoryDurability: ParentDirectoryDurability,
): Promise<Result<boolean, HarnessError>> {
  try {
    const disposition = await createOnlyImmutableFile({
      outputFilePath: filePath,
      content: Buffer.from(`${canonicalizeJson(evidence)}\n`, "utf8"),
      parentDirectoryDurability,
      parentDirectoryPolicy: ImmutableFileParentDirectoryPolicy.RequireExisting,
      commitOutcomeUnknownCode: HarnessErrorCode.CorruptStore,
      conflictErrorCode: HarnessErrorCode.CorruptStore,
      artifactName: "Agent Session Process Evidence",
    });
    return success(disposition === ImmutableFileWriteDisposition.Created);
  } catch (error) {
    return failure(
      error instanceof HarnessError
        ? error
        : new HarnessError(HarnessErrorCode.IoFailure, "进程证据原子写入失败。", {}, error),
    );
  }
}

/** 读取 canonical JSON 并严格复验进程证据摘要。 */
export async function readAgentSessionProcessEvidenceRecord(
  filePath: string,
  digest: ContentDigestPort,
): Promise<Result<AgentSessionProcessEvidence, HarnessError>> {
  try {
    const status = await lstat(filePath, { bigint: true });
    if (
      !status.isFile() ||
      status.isSymbolicLink() ||
      status.size <= 0n ||
      status.size > BigInt(Number.MAX_SAFE_INTEGER)
    ) {
      return failure(new HarnessError(HarnessErrorCode.CorruptStore, "进程证据文件无效。"));
    }
    const parsed = await readStrictJsonFile({
      filePath,
      expectedByteLength: Number(status.size),
      canonicalPolicy: StrictJsonCanonicalPolicy.Required,
    });
    return parsed.status === ResultStatus.Failure
      ? failure(new HarnessError(HarnessErrorCode.CorruptStore, "进程证据 JSON 无效。"))
      : rebuildAgentSessionProcessEvidence(parsed.value, digest);
  } catch (error) {
    return isNodeError(error) && error.code === "ENOENT"
      ? failure(new HarnessError(HarnessErrorCode.PreconditionNotMet, "进程证据不存在。"))
      : failure(new HarnessError(HarnessErrorCode.IoFailure, "进程证据读取失败。", {}, error));
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
