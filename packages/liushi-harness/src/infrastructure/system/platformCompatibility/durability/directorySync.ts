/** 判断目录 fsync 错误是否属于允许降级为 best-effort 的既有平台错误集合。 */
export function isBestEffortDirectorySyncError(error: unknown): error is NodeJS.ErrnoException {
  return (
    error instanceof Error &&
    "code" in error &&
    ["EISDIR", "EPERM", "EINVAL", "ENOTSUP", "EACCES"].includes(
      String((error as NodeJS.ErrnoException).code),
    )
  );
}
