import { isAbsolute, resolve } from "node:path";

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

/** Evidence 内容寻址文件及其排他锁路径。 */
export interface ExecutorCompatibilityEvidenceStorePaths {
  /** Evidence JSON 文件。 */
  readonly recordFile: string;
  /** Evidence 写入锁文件。 */
  readonly lockFile: string;
}

/** Artifact 精确 Locator 文件及其排他锁路径。 */
export interface ExecutorCompatibilityArtifactStorePaths {
  /** Locator 精确指向的 Artifact JSON 文件。 */
  readonly recordFile: string;
  /** Artifact 写入锁文件。 */
  readonly lockFile: string;
}

/** 严格解析 `sha256:<64hex>`，并拒绝任何非规范输入。 */
export function parseExecutorCompatibilityContentDigest(value: string): ContentDigest {
  const parsed = parseContentDigest(value);
  if (parsed.status === ResultStatus.Failure) throw parsed.error;
  return parsed.value;
}

/** 从严格摘要派生 Evidence 内容寻址路径。 */
export function resolveExecutorCompatibilityEvidenceStorePaths(
  storeRoot: string,
  evidenceDigest: ContentDigest,
): ExecutorCompatibilityEvidenceStorePaths {
  const digestHex = evidenceDigest.slice(CONTENT_DIGEST_PREFIX_LENGTH);
  const recordFile = resolve(storeRoot, "executorCompatibility", "evidence", `${digestHex}.json`);
  return { recordFile, lockFile: `${recordFile}.lock` };
}

/** 从受验 Runtime Store Locator 解析 Artifact 精确路径。 */
export function resolveExecutorCompatibilityArtifactStorePaths(
  storeRoot: string,
  locatorValue: string,
): ExecutorCompatibilityArtifactStorePaths {
  if (!isSafeRuntimeStoreLocator(locatorValue)) {
    throw new HarnessError(
      HarnessErrorCode.InvalidInput,
      "Executor Compatibility Runtime Store Locator 无效。",
      { field: "source.locator.value" },
    );
  }
  const recordFile = resolve(storeRoot, ...locatorValue.split("/"));
  return { recordFile, lockFile: `${recordFile}.lock` };
}

/** 判断 Locator 是否为不含逃逸语义的正斜杠相对路径。 */
export function isSafeRuntimeStoreLocator(value: string): boolean {
  if (
    value.length === 0 ||
    value.length > 512 ||
    value.includes("\0") ||
    value.includes("\\") ||
    value.startsWith("/") ||
    isAbsolute(value) ||
    /^[A-Za-z]:/u.test(value)
  ) {
    return false;
  }
  const segments = value.split("/");
  return segments.every(
    (segment) =>
      segment.length > 0 &&
      segment !== "." &&
      segment !== ".." &&
      /^[A-Za-z0-9._@+-]+$/u.test(segment),
  );
}

/** 证明所有派生路径位于无符号链接的 Runtime Store 内。 */
export async function assertExecutorCompatibilityEvidenceStorePathsSafe(
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
          "Executor Compatibility 路径必须位于无符号链接的 Runtime Store 内。",
        );
      }
    }
  } catch (error) {
    if (error instanceof HarnessError) throw error;
    throw new HarnessError(
      HarnessErrorCode.IoFailure,
      "无法校验 Executor Compatibility Evidence Store 路径。",
      {},
      error,
    );
  }
}
