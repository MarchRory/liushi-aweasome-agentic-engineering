import { posix, win32 } from "node:path";

import { failure, HarnessError, HarnessErrorCode, success, type Result } from "#common/index.js";

const WINDOWS_DRIVE_ABSOLUTE_PATH = /^[a-zA-Z]:[\\/]/u;
const WINDOWS_UNC_ABSOLUTE_PATH = /^[\\/]{2}(?![.?](?:[\\/]|$))[^\\/]+[\\/][^\\/]+(?:[\\/]|$)/u;

/** 与来源 Host 平台一致的路径语义。 */
export interface CodexHostPathSemantics {
  /** 判断值是否为当前 Host 语义下的无 NUL 绝对路径。 */
  isAbsolute(value: string): boolean;
  /** 按当前 Host 规则比较两个规范化绝对路径。 */
  equals(left: string, right: string): boolean;
  /** 按当前 Host 规则连接路径片段。 */
  join(...segments: readonly string[]): string;
  /** 按当前 Host 规则取得父目录。 */
  dirname(value: string): string;
}

/** 根据来源平台创建路径语义，避免使用当前进程 OS 猜测来源路径。 */
export function createCodexHostPathSemantics(
  platform: string,
): Result<CodexHostPathSemantics, HarnessError> {
  const pathApi =
    platform === "win32"
      ? win32
      : platform === "linux" || platform === "darwin"
        ? posix
        : undefined;
  if (pathApi === undefined) {
    return failure(
      new HarnessError(HarnessErrorCode.InvalidInput, "Codex host path platform is unsupported."),
    );
  }
  const isAbsolute = (value: string): boolean =>
    !value.includes("\0") &&
    (platform === "win32"
      ? WINDOWS_DRIVE_ABSOLUTE_PATH.test(value) || WINDOWS_UNC_ABSOLUTE_PATH.test(value)
      : pathApi.isAbsolute(value));
  return success({
    isAbsolute,
    equals: (left, right) =>
      isAbsolute(left) && isAbsolute(right) && pathApi.normalize(left) === pathApi.normalize(right),
    join: (...segments) => pathApi.join(...segments),
    dirname: (value) => pathApi.dirname(value),
  });
}
