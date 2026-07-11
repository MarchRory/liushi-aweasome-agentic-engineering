import { HarnessError, HarnessErrorCode, failure, success, type Result } from "#common/index.js";

const WINDOWS_ABSOLUTE_PATH_PATTERN = /^[A-Za-z]:\//;
const RELATIVE_PATH_WILDCARD_PATTERN = /[*?\[\]]/;

/** 将外部路径转换为跨平台稳定的 Repository 相对路径。 */
export function normalizeRuleRelativePath(value: string): Result<string, HarnessError> {
  return normalizePath(value, false, "relativePath");
}

/** 将外部 Glob 转换为跨平台稳定且禁止路径穿越的模式。 */
export function normalizeRulePathGlob(value: string): Result<string, HarnessError> {
  return normalizePath(value, true, "pathGlob");
}

/** 判断规范相对路径是否位于给定目录前缀内。 */
export function isPathWithinPrefix(relativePath: string, pathPrefix: string): boolean {
  return relativePath === pathPrefix || relativePath.startsWith(`${pathPrefix}/`);
}

function normalizePath(
  value: string,
  allowWildcard: boolean,
  field: string,
): Result<string, HarnessError> {
  const normalized = value.replaceAll("\\", "/");
  const segments = normalized.split("/");
  const invalid =
    value.length === 0 ||
    value !== value.trim() ||
    normalized.startsWith("/") ||
    WINDOWS_ABSOLUTE_PATH_PATTERN.test(normalized) ||
    normalized.endsWith("/") ||
    segments.some((segment) => segment.length === 0 || segment === "." || segment === "..") ||
    normalized.includes("\0") ||
    (!allowWildcard && RELATIVE_PATH_WILDCARD_PATTERN.test(normalized));

  if (invalid) {
    return failure(
      new HarnessError(
        HarnessErrorCode.InvalidInput,
        allowWildcard
          ? "Rule path glob must be a normalized repository-relative pattern without traversal."
          : "Rule path must be repository-relative and cannot contain traversal or wildcard segments.",
        { field },
      ),
    );
  }

  return success(normalized);
}
