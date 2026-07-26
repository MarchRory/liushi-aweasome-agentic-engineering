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
import {
  rebuildCodingTaskSessionAdmissionState,
  type CodingTaskSessionAdmissionState,
} from "#domain/codingTaskSession/index.js";

/** 读取无任意大小预算的严格 canonical Admission JSON，并完成领域重建。 */
export async function readCodingTaskSessionAdmissionState(
  stateFile: string,
): Promise<Result<CodingTaskSessionAdmissionState, HarnessError>> {
  let byteLength: number;
  try {
    const status = await lstat(stateFile, { bigint: true });
    if (!status.isFile() || status.isSymbolicLink() || status.size <= 0n) {
      return failure(
        new HarnessError(HarnessErrorCode.CorruptStore, "Admission State 文件类型无效"),
      );
    }
    if (status.size > BigInt(Number.MAX_SAFE_INTEGER)) {
      return failure(
        new HarnessError(HarnessErrorCode.CorruptStore, "Admission State 文件大小无效"),
      );
    }
    byteLength = Number(status.size);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return failure(
        new HarnessError(HarnessErrorCode.PreconditionNotMet, "Admission State 不存在"),
      );
    }
    return failure(
      new HarnessError(HarnessErrorCode.IoFailure, "Admission State 读取失败", {}, error),
    );
  }

  const parsed = await readStrictJsonFile({
    filePath: stateFile,
    expectedByteLength: byteLength,
    canonicalPolicy: StrictJsonCanonicalPolicy.Required,
  });
  if (parsed.status === ResultStatus.Failure) {
    return failure(
      new HarnessError(
        HarnessErrorCode.CorruptStore,
        "Admission State JSON 无效",
        {},
        parsed.error,
      ),
    );
  }
  const rebuilt = rebuildCodingTaskSessionAdmissionState(parsed.value);
  return rebuilt.status === ResultStatus.Failure
    ? failure(
        new HarnessError(
          HarnessErrorCode.CorruptStore,
          "Admission State 完整性校验失败",
          {},
          rebuilt.error,
        ),
      )
    : success(rebuilt.value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
