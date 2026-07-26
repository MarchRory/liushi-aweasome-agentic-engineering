/** 判断错误是否包含 Node 文件系统错误码。 */
function isFileSystemError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

/** 判断目录 fsync 错误是否代表当前平台已经达到等价耐久语义。 */
export function isPlatformEquivalentDirectorySyncError(
  error: unknown,
  platform: NodeJS.Platform = process.platform,
): error is NodeJS.ErrnoException {
  return (
    platform === "win32" &&
    isFileSystemError(error) &&
    error.code === "EPERM" &&
    error.syscall === "fsync"
  );
}

/** 判断目录 fsync 错误是否属于允许降级为 best-effort 的既有平台错误集合。 */
export function isBestEffortDirectorySyncError(error: unknown): error is NodeJS.ErrnoException {
  return (
    isFileSystemError(error) &&
    ["EISDIR", "EPERM", "EINVAL", "ENOTSUP", "EACCES"].includes(String(error.code))
  );
}
