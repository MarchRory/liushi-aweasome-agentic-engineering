import { posix, win32 } from "node:path";

const WINDOWS_PATH_PATTERN = /^(?:[A-Za-z]:[\\/]|\\\\)/u;

export function normalizeAbsolutePath(value, label = "path") {
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

export function pathIdentity(value) {
  const normalized = normalizeAbsolutePath(value);
  return WINDOWS_PATH_PATTERN.test(normalized) ? normalized.toLowerCase() : normalized;
}

export function sameAbsolutePath(left, right) {
  return pathIdentity(left) === pathIdentity(right);
}

export function createAbsolutePathSet(values, label = "paths") {
  if (!Array.isArray(values) || values.length === 0) {
    throw new TypeError(`${label} must be a non-empty array`);
  }

  const result = new Map();
  for (const value of values) {
    const normalized = normalizeAbsolutePath(value, label);
    const identity = pathIdentity(normalized);
    if (result.has(identity)) throw new Error(`${label} must not contain duplicates`);
    result.set(identity, normalized);
  }
  return result;
}
