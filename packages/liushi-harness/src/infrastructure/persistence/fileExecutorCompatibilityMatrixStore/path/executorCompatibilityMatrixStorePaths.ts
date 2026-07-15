import { resolve } from "node:path";

import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  parseContentDigest,
  type ContentDigest,
} from "#common/index.js";
import {
  hasSymbolicLinkBetween,
  pathContains,
  resolveCanonicalPathIdentity,
} from "#infrastructure/system/platformCompatibility/index.js";

const CONTENT_DIGEST_PREFIX_LENGTH = "sha256:".length;

/** Matrix 内容寻址文件及其排他锁路径。 */
export interface ExecutorCompatibilityMatrixStorePaths {
  /** Matrix JSON 文件。 */
  readonly recordFile: string;
  /** Matrix 写入锁文件。 */
  readonly lockFile: string;
}

/** 严格解析 Matrix 的 `sha256:<64hex>` 内容摘要。 */
export function parseExecutorCompatibilityMatrixDigest(value: string): ContentDigest {
  const parsed = parseContentDigest(value);
  if (parsed.status === ResultStatus.Failure) throw parsed.error;
  return parsed.value;
}

/** 从严格摘要派生 Matrix 内容寻址路径。 */
export function resolveExecutorCompatibilityMatrixStorePaths(
  storeRoot: string,
  matrixDigest: ContentDigest,
): ExecutorCompatibilityMatrixStorePaths {
  const digestHex = matrixDigest.slice(CONTENT_DIGEST_PREFIX_LENGTH);
  const recordFile = resolve(storeRoot, "executorCompatibility", "matrices", `${digestHex}.json`);
  return { recordFile, lockFile: `${recordFile}.lock` };
}

/** 证明 Matrix 派生路径位于无符号链接的 Runtime Store 内。 */
export async function assertExecutorCompatibilityMatrixStorePathsSafe(
  storeRoot: string,
  candidates: readonly string[],
  corruptOnFailure = false,
): Promise<void> {
  try {
    const canonicalStoreRoot = await resolveCanonicalPathIdentity(storeRoot);
    for (const candidate of candidates) {
      const canonicalCandidate = await resolveCanonicalPathIdentity(candidate);
      if (
        (await hasSymbolicLinkBetween(storeRoot, candidate)) ||
        !pathContains(canonicalStoreRoot, canonicalCandidate)
      ) {
        throw new HarnessError(
          corruptOnFailure ? HarnessErrorCode.CorruptStore : HarnessErrorCode.OperationForbidden,
          "Executor Compatibility Matrix 路径必须位于无符号链接的 Runtime Store 内。",
        );
      }
    }
  } catch (error) {
    if (error instanceof HarnessError) throw error;
    throw new HarnessError(
      HarnessErrorCode.IoFailure,
      "无法校验 Executor Compatibility Matrix Store 路径。",
      {},
      error,
    );
  }
}
