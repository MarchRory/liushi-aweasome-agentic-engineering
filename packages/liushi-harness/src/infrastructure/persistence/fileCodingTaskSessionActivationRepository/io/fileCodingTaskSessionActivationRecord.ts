import { lstat } from "node:fs/promises";

import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import {
  StrictJsonCanonicalPolicy,
  readStrictJsonFile,
} from "#infrastructure/strictJsonFileReader/index.js";

import type {
  CodingTaskSessionActivationDigestPort,
  CodingTaskSessionActivationRecord,
} from "#domain/codingTaskSession/index.js";
import { rebuildCodingTaskSessionActivationRecord } from "#domain/codingTaskSession/index.js";

/** 读取无界字节预算的严格 canonical Activation JSON，并重新领域重建。 */
export async function readCodingTaskSessionActivationRecord(
  filePath: string,
  digestPort: CodingTaskSessionActivationDigestPort,
): Promise<Result<CodingTaskSessionActivationRecord, HarnessError>> {
  let byteLength: number;
  try {
    const status = await lstat(filePath, { bigint: true });
    if (!status.isFile() || status.isSymbolicLink() || status.size <= 0n) {
      return failure(
        new HarnessError(HarnessErrorCode.CorruptStore, "Activation Record 文件类型无效。"),
      );
    }
    if (status.size > BigInt(Number.MAX_SAFE_INTEGER)) {
      return failure(
        new HarnessError(HarnessErrorCode.CorruptStore, "Activation Record 文件大小无效。"),
      );
    }
    byteLength = Number(status.size);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return failure(
        new HarnessError(HarnessErrorCode.PreconditionNotMet, "Activation Record 不存在。"),
      );
    }
    return failure(new HarnessError(HarnessErrorCode.IoFailure, "Activation Record 读取失败。"));
  }

  const parsed = await readStrictJsonFile({
    filePath,
    expectedByteLength: byteLength,
    canonicalPolicy: StrictJsonCanonicalPolicy.Required,
  });
  if (parsed.status === ResultStatus.Failure) {
    return failure(
      new HarnessError(HarnessErrorCode.CorruptStore, "Activation Record JSON 无效。"),
    );
  }
  const rebuilt = rebuildCodingTaskSessionActivationRecord(parsed.value, digestPort);
  return rebuilt.status === ResultStatus.Failure
    ? failure(new HarnessError(HarnessErrorCode.CorruptStore, "Activation Record 完整性校验失败。"))
    : success(rebuilt.value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
