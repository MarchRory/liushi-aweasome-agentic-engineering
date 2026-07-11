import { HarnessError, HarnessErrorCode } from "../errors/index.js";
import { failure, success, type Result } from "../result/index.js";

/** Content Digest 使用的带算法前缀 SHA-256 格式。 */
export const CONTENT_DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;

declare const contentDigestBrand: unique symbol;

/** 对 JSON 兼容内容计算并经过格式校验的 SHA-256 Digest。 */
export type ContentDigest = string & { readonly [contentDigestBrand]: true };

/** 将外部字符串校验并转换为通用 Content Digest。 */
export function parseContentDigest(value: string): Result<ContentDigest, HarnessError> {
  if (!CONTENT_DIGEST_PATTERN.test(value)) {
    return failure(
      new HarnessError(
        HarnessErrorCode.InvalidInput,
        "Content digest must use sha256:<64 lowercase hex> format.",
        { field: "contentDigest" },
      ),
    );
  }

  return success(value as ContentDigest);
}
