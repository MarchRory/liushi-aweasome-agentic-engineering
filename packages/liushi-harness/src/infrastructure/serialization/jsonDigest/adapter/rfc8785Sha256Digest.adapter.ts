import type { ContentDigestPort } from "#application/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  parseContentDigest,
  success,
  type ContentDigest,
  type Result,
} from "#common/index.js";

import { calculateCanonicalJsonSha256 } from "../io/index.js";

/** 使用 RFC 8785 JCS 与 SHA-256 实现 ContentDigestPort。 */
export class Rfc8785Sha256DigestAdapter implements ContentDigestPort {
  /** 计算带算法前缀的规范 Content Digest。 */
  public calculate(input: unknown): Result<ContentDigest, HarnessError> {
    try {
      const parsed = parseContentDigest(`sha256:${calculateCanonicalJsonSha256(input)}`);
      if (parsed.status === ResultStatus.Failure) {
        return parsed;
      }
      return success(parsed.value);
    } catch (error) {
      return failure(
        error instanceof HarnessError
          ? error
          : new HarnessError(
              HarnessErrorCode.InvalidInput,
              "Unable to calculate canonical JSON digest.",
              {},
              error,
            ),
      );
    }
  }
}
