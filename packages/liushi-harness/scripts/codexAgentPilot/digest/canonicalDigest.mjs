import { createHash } from "node:crypto";

import canonicalize from "canonicalize";

export function calculateDigest(value) {
  const serialized = canonicalize(value);
  if (serialized === undefined) throw new Error("无法为 undefined 计算摘要。");
  return `sha256:${createHash("sha256").update(serialized, "utf8").digest("hex")}`;
}

export function calculateTextDigest(value) {
  if (typeof value !== "string") throw new Error("文本摘要输入必须是字符串。");
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}
