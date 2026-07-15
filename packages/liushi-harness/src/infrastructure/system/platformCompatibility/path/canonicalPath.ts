import { lstat, realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { normalizePathIdentity, pathApiForPlatform } from "./pathIdentity.js";

/** 解析已存在祖先的真实路径，并保留尚未创建的尾部片段。 */
export async function resolveCanonicalPathIdentity(value: string): Promise<string> {
  let current = resolve(value);
  const missingSegments: string[] = [];
  while (true) {
    try {
      return resolve(await realpath(current), ...missingSegments);
    } catch (error) {
      if (!isMissingPathError(error)) throw error;
      const parent = dirname(current);
      if (parent === current) throw error;
      missingSegments.unshift(basename(current));
      current = parent;
    }
  }
}

/** 判断两个规范路径是否相等或存在祖先与后代关系。 */
export function pathsOverlap(
  left: string,
  right: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  const leftIdentity = normalizePathIdentity(left, platform);
  const rightIdentity = normalizePathIdentity(right, platform);
  return (
    pathContains(leftIdentity, rightIdentity, platform) ||
    pathContains(rightIdentity, leftIdentity, platform)
  );
}

/** 判断 child 是否等于 parent，或位于 parent 的后代路径中。 */
export function pathContains(
  parent: string,
  child: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  const pathApi = pathApiForPlatform(platform);
  const parentIdentity = normalizePathIdentity(parent, platform);
  const childIdentity = normalizePathIdentity(child, platform);
  const childRelativePath = pathApi.relative(parentIdentity, childIdentity);
  return (
    childRelativePath.length === 0 ||
    (childRelativePath !== ".." &&
      !childRelativePath.startsWith(`..${pathApi.sep}`) &&
      !pathApi.isAbsolute(childRelativePath))
  );
}

/** 检查配置根到目标之间已存在的路径组件是否包含符号链接。 */
export async function hasSymbolicLinkBetween(root: string, target: string): Promise<boolean> {
  const resolvedRoot = resolve(root);
  const resolvedTarget = resolve(target);
  const targetRelativePath = relative(resolvedRoot, resolvedTarget);
  if (
    targetRelativePath === ".." ||
    targetRelativePath.startsWith(`..${sep}`) ||
    isAbsolute(targetRelativePath)
  )
    return true;
  const candidates = [
    resolvedRoot,
    ...targetRelativePath
      .split(sep)
      .filter((segment) => segment.length > 0)
      .map((_, index, segments) => join(resolvedRoot, ...segments.slice(0, index + 1))),
  ];
  for (const candidate of candidates) {
    try {
      if ((await lstat(candidate)).isSymbolicLink()) return true;
    } catch (error) {
      if (isMissingPathError(error)) break;
      throw error;
    }
  }
  return false;
}

function isMissingPathError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
