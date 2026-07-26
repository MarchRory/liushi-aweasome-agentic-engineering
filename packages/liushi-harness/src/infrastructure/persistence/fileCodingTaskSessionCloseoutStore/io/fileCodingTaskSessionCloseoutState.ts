import { lstat } from "node:fs/promises";

import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import type { ContentDigestPort } from "#application/ports/contentDigest/index.js";
import {
  rebuildCodingTaskSessionCloseoutState,
  type CodingTaskSessionCloseoutState,
} from "#application/codingTaskSessionCloseoutState/index.js";
import { classifyCodingTaskSessionCloseoutV1 } from "#application/codingTaskSessionCloseoutState/validation/legacy/index.js";
import {
  StrictJsonCanonicalPolicy,
  readStrictJsonFile,
} from "#infrastructure/strictJsonFileReader/index.js";
import { canonicalizeJson } from "#infrastructure/serialization/index.js";

import type { CodingTaskSessionCloseoutStorePaths } from "../contracts/index.js";

/** 读取普通文件，执行 canonical JSON、Schema、摘要与阶段不变量重建。 */
export async function readCodingTaskSessionCloseoutState(
  paths: CodingTaskSessionCloseoutStorePaths,
  digestPort: ContentDigestPort,
): Promise<Result<CodingTaskSessionCloseoutState, HarnessError>> {
  let byteLength: number;
  try {
    const status = await lstat(paths.stateFile, { bigint: true });
    if (!status.isFile() || status.isSymbolicLink() || status.size <= 0n) {
      return failure(
        new HarnessError(HarnessErrorCode.CorruptStore, "Closeout State 文件类型无效。"),
      );
    }
    if (status.size > BigInt(Number.MAX_SAFE_INTEGER)) {
      return failure(
        new HarnessError(HarnessErrorCode.CorruptStore, "Closeout State 文件大小无效。"),
      );
    }
    byteLength = Number(status.size);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return failure(
        new HarnessError(HarnessErrorCode.PreconditionNotMet, "Closeout State 不存在。"),
      );
    }
    return failure(
      new HarnessError(HarnessErrorCode.IoFailure, "Closeout State 读取失败。", {}, error),
    );
  }

  const parsed = await readStrictJsonFile({
    filePath: paths.stateFile,
    expectedByteLength: byteLength,
    canonicalPolicy: StrictJsonCanonicalPolicy.Required,
  });
  if (parsed.status === ResultStatus.Failure) {
    return failure(
      new HarnessError(
        HarnessErrorCode.CorruptStore,
        "Closeout State JSON 无效。",
        {},
        parsed.error,
      ),
    );
  }
  const legacyError = classifyCodingTaskSessionCloseoutV1(
    parsed.value,
    { workspaceId: paths.workspaceId, sessionId: paths.sessionId },
    digestPort,
  );
  if (legacyError !== undefined) return failure(legacyError);
  const rebuilt = rebuildCodingTaskSessionCloseoutState(parsed.value, digestPort);
  if (rebuilt.status === ResultStatus.Failure) {
    return failure(
      new HarnessError(
        HarnessErrorCode.CorruptStore,
        "Closeout State 完整性校验失败。",
        {},
        rebuilt.error,
      ),
    );
  }
  if (
    rebuilt.value.workspaceId !== paths.workspaceId ||
    rebuilt.value.sessionId !== paths.sessionId
  ) {
    return failure(
      new HarnessError(
        HarnessErrorCode.CorruptStore,
        "Closeout State 的持久化身份与文件定位不一致。",
      ),
    );
  }
  try {
    if (canonicalizeJson(rebuilt.value) !== canonicalizeJson(parsed.value)) {
      return failure(
        new HarnessError(HarnessErrorCode.CorruptStore, "Closeout State 非规范状态。"),
      );
    }
  } catch (error) {
    return failure(
      new HarnessError(HarnessErrorCode.CorruptStore, "Closeout State 无法规范化。", {}, error),
    );
  }
  return success(rebuilt.value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
