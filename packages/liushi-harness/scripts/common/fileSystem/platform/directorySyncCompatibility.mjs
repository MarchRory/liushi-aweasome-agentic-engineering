import process from "node:process";

export function isPlatformEquivalentDirectorySyncError(error, platform = process.platform) {
  return (
    platform === "win32" &&
    error instanceof Error &&
    error.code === "EPERM" &&
    error.syscall === "fsync"
  );
}
