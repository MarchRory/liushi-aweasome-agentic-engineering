import { lstat } from "node:fs/promises";

import {
  rebuildCodingTaskSessionCloseoutRecoveryState,
  type CodingTaskSessionCloseoutRecoveryState,
} from "#application/codingTaskSessionCloseoutRecovery/state/index.js";
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
  StrictJsonCanonicalPolicy,
  readStrictJsonFile,
} from "#infrastructure/strictJsonFileReader/index.js";
import { canonicalizeJson } from "#infrastructure/serialization/index.js";

import type { CodingTaskSessionCloseoutRecoveryStorePaths } from "../contracts/index.js";
import { asCodingTaskSessionCloseoutRecoveryReadError } from "../errors/index.js";

/** 读取并严格重建 Recovery State，保留读取故障并将内容损坏映射为 CorruptStore。 */
export async function readCodingTaskSessionCloseoutRecoveryState(
  paths: CodingTaskSessionCloseoutRecoveryStorePaths,
  digestPort: ContentDigestPort,
): Promise<Result<CodingTaskSessionCloseoutRecoveryState, HarnessError>> {
  let byteLength: number;
  try {
    const status = await lstat(paths.stateFile, { bigint: true });
    if (!status.isFile() || status.isSymbolicLink() || status.size <= 0n) {
      return failure(
        new HarnessError(HarnessErrorCode.CorruptStore, "Recovery State 文件类型无效。"),
      );
    }
    if (status.size > BigInt(Number.MAX_SAFE_INTEGER)) {
      return failure(
        new HarnessError(HarnessErrorCode.CorruptStore, "Recovery State 文件大小无效。"),
      );
    }
    byteLength = Number(status.size);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return failure(
        new HarnessError(HarnessErrorCode.PreconditionNotMet, "Recovery State 不存在。"),
      );
    }
    return failure(
      new HarnessError(HarnessErrorCode.IoFailure, "Recovery State 读取失败。", {}, error),
    );
  }

  const parsed = await readStrictJsonFile({
    filePath: paths.stateFile,
    expectedByteLength: byteLength,
    canonicalPolicy: StrictJsonCanonicalPolicy.Required,
  });
  if (parsed.status === ResultStatus.Failure) {
    return failure(asCodingTaskSessionCloseoutRecoveryReadError(parsed.error));
  }
  const rebuilt = rebuildCodingTaskSessionCloseoutRecoveryState(parsed.value, digestPort);
  if (rebuilt.status === ResultStatus.Failure) {
    return failure(
      new HarnessError(
        HarnessErrorCode.CorruptStore,
        "Recovery State 完整性校验失败。",
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
      new HarnessError(HarnessErrorCode.CorruptStore, "Recovery State 定位身份漂移。"),
    );
  }
  try {
    if (canonicalizeJson(rebuilt.value) !== canonicalizeJson(parsed.value)) {
      return failure(
        new HarnessError(HarnessErrorCode.CorruptStore, "Recovery State 不是规范状态。"),
      );
    }
  } catch (error) {
    return failure(
      new HarnessError(HarnessErrorCode.CorruptStore, "Recovery State 无法规范化。", {}, error),
    );
  }
  return success(rebuilt.value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
