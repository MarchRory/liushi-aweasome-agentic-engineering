import { isAbsolute, normalize, relative, sep } from "node:path";

import type { ProjectPathCaseCollision } from "#application/ports/projectFileSystem/index.js";

/** 使用与 locale 无关的排序比较仓库相对路径。 */
export function compareRelativePaths(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

/** 将绝对路径转换为仓库相对 POSIX 路径。 */
export function toRelativePosixPath(root: string, absolutePath: string): string {
  return relative(root, absolutePath).split(sep).join("/");
}

/** 为真实仓库 root 创建稳定的内部 identity。 */
export function canonicalizeRootIdentity(realRoot: string): string {
  const normalized = normalize(realRoot);
  const withoutTrailingSeparator = normalized.replace(/[\\/]$/, "");
  return process.platform === "win32"
    ? withoutTrailingSeparator.toLocaleLowerCase("en-US")
    : withoutTrailingSeparator;
}

/** 测试候选路径是否为 root，或按字面路径位于 root 下方。 */
export function isPathWithinRoot(root: string, candidate: string): boolean {
  const candidateRelativePath = relative(root, candidate);
  return (
    candidateRelativePath === "" ||
    (!candidateRelativePath.startsWith(`..${sep}`) &&
      candidateRelativePath !== ".." &&
      !isAbsolute(candidateRelativePath))
  );
}

/** 按两个相对路径比较 collision records。 */
export function compareCaseCollisions(
  left: ProjectPathCaseCollision,
  right: ProjectPathCaseCollision,
): number {
  return (
    compareRelativePaths(left.firstPath, right.firstPath) ||
    compareRelativePaths(left.secondPath, right.secondPath)
  );
}

/** 规范化不可信的仓库相对路径；不安全时返回 undefined。 */
export function normalizeRequestedRelativePath(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
    return undefined;
  }

  const slashPath = value.replaceAll("\\", "/");
  if (slashPath.startsWith("/") || slashPath.startsWith("//") || /^[A-Za-z]:\//u.test(slashPath)) {
    return undefined;
  }

  const segments = slashPath.split("/");
  if (segments.some((segment) => segment === "." || segment === "..")) {
    return undefined;
  }

  const normalized = segments.filter((segment) => segment.length > 0).join("/");
  if (normalized.length === 0) {
    return undefined;
  }

  return normalized;
}
