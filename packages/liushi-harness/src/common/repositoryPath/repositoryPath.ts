/** 规范化跨平台的仓库相对路径；非法路径返回 undefined。 */
export function normalizeRepositoryRelativePath(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;

  const normalized = value.trim().replaceAll("\\", "/");
  if (
    !normalized ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:/u.test(normalized) ||
    normalized.includes("//") ||
    /[<>:"|?*\u0000-\u001f\u007f]/u.test(normalized)
  ) {
    return undefined;
  }

  const segments = normalized.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    return undefined;
  }

  return segments.join("/");
}

/** 判断输入是否已经是确定性的仓库相对 POSIX 路径。 */
export function isCanonicalRepositoryRelativePath(value: unknown): value is string {
  return typeof value === "string" && normalizeRepositoryRelativePath(value) === value;
}
