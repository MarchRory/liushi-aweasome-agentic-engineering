import type { ContentDigest, HarnessError, Result } from "#common/index.js";

/** Application 对规范 JSON 内容计算稳定 Digest 的 Port。 */
export interface ContentDigestPort {
  /** 对 JSON-compatible 输入计算带 sha256 前缀的 RFC 8785 Digest。 */
  calculate(input: unknown): Result<ContentDigest, HarnessError>;
}
