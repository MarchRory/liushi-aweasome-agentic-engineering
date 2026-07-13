import { createHash } from "node:crypto";

import canonicalize from "canonicalize";

export function calculateDigest(value) {
  const serialized = canonicalize(value);
  if (serialized === undefined) throw new Error("摘要输入不能表示为 RFC 8785 JSON。");
  return `sha256:${createHash("sha256").update(serialized, "utf8").digest("hex")}`;
}
