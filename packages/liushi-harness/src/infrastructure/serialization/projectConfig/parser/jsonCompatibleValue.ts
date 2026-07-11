const MAX_CONFIG_VALUE_DEPTH = 100;
const FORBIDDEN_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** 判断 Parser 输出是否为受深度限制且无危险键的 JSON-compatible Value。 */
export function isSafeJsonCompatibleValue(value: unknown): boolean {
  return visit(value, 0, new Set<object>());
}

function visit(value: unknown, depth: number, ancestors: Set<object>): boolean {
  if (depth > MAX_CONFIG_VALUE_DEPTH) {
    return false;
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return true;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (typeof value !== "object" || ancestors.has(value)) {
    return false;
  }

  ancestors.add(value);
  const valid = Array.isArray(value)
    ? value.every((entry) => visit(entry, depth + 1, ancestors))
    : isPlainObject(value) &&
      Object.entries(value).every(
        ([key, entry]) => !FORBIDDEN_OBJECT_KEYS.has(key) && visit(entry, depth + 1, ancestors),
      );
  ancestors.delete(value);
  return valid;
}

function isPlainObject(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}
