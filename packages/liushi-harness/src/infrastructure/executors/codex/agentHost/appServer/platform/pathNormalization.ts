import { posix, win32 } from "node:path";

const WINDOWS_PATH_PATTERN = /^(?:[A-Za-z]:[\\/]|\\\\)/u;

/** 把绝对路径规范化为对应平台的稳定形式。 */
export function normalizeAbsolutePath(value: unknown, label = "path"): string {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
    throw new TypeError(`${label} must be a non-empty path without NUL`);
  }

  const windows = WINDOWS_PATH_PATTERN.test(value);
  const normalized = windows ? win32.normalize(value) : posix.normalize(value);
  if (windows ? !win32.isAbsolute(normalized) : !posix.isAbsolute(normalized)) {
    throw new TypeError(`${label} must be absolute`);
  }
  return normalized;
}

/** 返回忽略 Windows 大小写差异的路径身份。 */
export function pathIdentity(value: string): string {
  const normalized = normalizeAbsolutePath(value);
  return WINDOWS_PATH_PATTERN.test(normalized) ? normalized.toLowerCase() : normalized;
}

/** 判断两个绝对路径是否指向同一路径身份。 */
export function sameAbsolutePath(left: string, right: string): boolean {
  return pathIdentity(left) === pathIdentity(right);
}

/** 规范化并去重一组非空绝对路径。 */
export function createAbsolutePathSet(values: unknown, label = "paths"): Map<string, string> {
  if (!Array.isArray(values) || values.length === 0) {
    throw new TypeError(`${label} must be a non-empty array`);
  }

  const result = new Map<string, string>();
  for (const value of values) {
    const normalized = normalizeAbsolutePath(value, label);
    const identity = pathIdentity(normalized);
    if (result.has(identity)) {
      throw new Error(`${label} must not contain duplicates`);
    }
    result.set(identity, normalized);
  }
  return result;
}
