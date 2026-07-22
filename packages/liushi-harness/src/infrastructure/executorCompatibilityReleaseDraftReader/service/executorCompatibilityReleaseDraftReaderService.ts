import { lstat } from "node:fs/promises";
import { isAbsolute } from "node:path";

import type { ContentDigestPort } from "#application/ports/contentDigest/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  failure,
  ResultStatus,
  type Result,
} from "#common/index.js";
import { readStrictJsonFile } from "#infrastructure/strictJsonFileReader/index.js";

import { EXECUTOR_COMPATIBILITY_RELEASE_DRAFT_JSON_POLICY } from "../constants/index.js";
import type { ReleaseDraftValidator } from "../contracts/index.js";

/**
 * 从绝对路径严格读取并重建 Release Draft。
 *
 * @param draftFilePath Draft 文件的绝对路径。
 * @param digest 用于领域重建与摘要复验的实现。
 * @param validate 将严格 JSON 值重建为具体 Draft 的验证器。
 * @returns 成功时返回已重建 Draft，失败时返回稳定 Harness 错误。
 */
export async function readReleaseDraft<TDraft>(
  draftFilePath: string,
  digest: ContentDigestPort,
  validate: ReleaseDraftValidator<TDraft>,
): Promise<Result<TDraft, HarnessError>> {
  if (!isAbsolute(draftFilePath)) {
    return failure(
      new HarnessError(HarnessErrorCode.InvalidInput, "Draft 文件路径必须是绝对路径。"),
    );
  }
  try {
    const stats = await lstat(draftFilePath, { bigint: true });
    if (!stats.isFile() || stats.isSymbolicLink() || stats.size <= 0n) {
      return failure(new HarnessError(HarnessErrorCode.InvalidInput, "Draft 必须是非空普通文件。"));
    }
    if (stats.size > BigInt(Number.MAX_SAFE_INTEGER)) {
      return failure(
        new HarnessError(HarnessErrorCode.InvalidInput, "Draft 文件长度超出安全整数范围。"),
      );
    }
    const parsed = await readStrictJsonFile({
      filePath: draftFilePath,
      expectedByteLength: Number(stats.size),
      canonicalPolicy: EXECUTOR_COMPATIBILITY_RELEASE_DRAFT_JSON_POLICY,
    });
    if (parsed.status === ResultStatus.Failure) return failure(parsed.error);
    return validate(parsed.value, digest);
  } catch (error) {
    return failure(
      error instanceof HarnessError
        ? error
        : new HarnessError(
            HarnessErrorCode.IoFailure,
            "读取 Draft 文件失败。",
            { draftFilePath },
            error,
          ),
    );
  }
}
