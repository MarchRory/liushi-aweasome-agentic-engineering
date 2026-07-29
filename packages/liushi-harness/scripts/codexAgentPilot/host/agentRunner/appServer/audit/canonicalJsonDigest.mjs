import { createHash } from "node:crypto";

export function calculateCanonicalJsonSha256(value) {
  const canonicalJson = canonicalizeJson(value);
  return `sha256:${createHash("sha256").update(canonicalJson, "utf8").digest("hex")}`;
}

function canonicalizeJson(value, ancestors = new Set()) {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("canonical JSON only supports finite numbers");
    return JSON.stringify(value);
  }
  if (typeof value !== "object") {
    throw new TypeError("value is not canonical JSON data");
  }
  if (ancestors.has(value)) throw new TypeError("canonical JSON data must not be cyclic");

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const items = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, index);
        if (descriptor === undefined || !Object.hasOwn(descriptor, "value")) {
          throw new TypeError("canonical JSON arrays must not be sparse");
        }
        items.push(canonicalizeJson(descriptor.value, ancestors));
      }
      return `[${items.join(",")}]`;
    }

    const prototype = Object.getPrototypeOf(value);
    if (
      (prototype !== Object.prototype && prototype !== null) ||
      Object.getOwnPropertySymbols(value).length > 0
    ) {
      throw new TypeError("canonical JSON objects must be plain records");
    }
    const members = Object.keys(value)
      .sort()
      .map((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (descriptor === undefined || !Object.hasOwn(descriptor, "value")) {
          throw new TypeError("canonical JSON objects must contain data properties");
        }
        return `${JSON.stringify(key)}:${canonicalizeJson(descriptor.value, ancestors)}`;
      });
    return `{${members.join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}
