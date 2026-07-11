import { createHash } from "node:crypto";

import canonicalize from "canonicalize";

import { HarnessError, HarnessErrorCode } from "#common/index.js";

/** 将 JSON-compatible 输入序列化为 RFC 8785 JSON Canonicalization Scheme 文本。 */
export function canonicalizeJson(input: unknown): string {
  let serialized: string | undefined;
  try {
    serialized = canonicalize(input);
  } catch (error) {
    throw new HarnessError(
      HarnessErrorCode.InvalidInput,
      "Value cannot be represented as canonical JSON.",
      { operation: "canonicalize" },
      error,
    );
  }

  if (serialized === undefined) {
    throw new HarnessError(
      HarnessErrorCode.InvalidInput,
      "Value cannot be represented as canonical JSON.",
      { operation: "canonicalize" },
    );
  }
  return serialized;
}

/** 对 RFC 8785 规范 JSON 文本计算 lowercase SHA-256 hex。 */
export function calculateCanonicalJsonSha256(input: unknown): string {
  return createHash("sha256").update(canonicalizeJson(input), "utf8").digest("hex");
}
