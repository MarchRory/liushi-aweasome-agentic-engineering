import type { ExecutorCompatibilityInTotoStatement } from "#domain/executorCompatibilityAttestation/index.js";
import { canonicalizeJson } from "#infrastructure/serialization/index.js";

/** 将受信 Statement 转为 Sigstore DSSE 必须逐字节签名的 RFC 8785 字节。 */
export function serializeExecutorCompatibilityInTotoStatement(
  statement: ExecutorCompatibilityInTotoStatement,
): Buffer {
  return Buffer.from(canonicalizeJson(statement), "utf8");
}
