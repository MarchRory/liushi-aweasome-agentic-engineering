import { posix, win32 } from "node:path";

/** 按目标平台选择路径语义，供可测试的平台兼容层统一使用。 */
export function pathApiForPlatform(platform: NodeJS.Platform): typeof posix {
  return platform === "win32" ? win32 : posix;
}

/** 将路径规范化为用于 identity 比较的稳定值。 */
export function normalizePathIdentity(
  value: string,
  platform: NodeJS.Platform = process.platform,
): string {
  const pathApi = pathApiForPlatform(platform);
  const normalized = pathApi.normalize(value);
  const root = pathApi.parse(normalized).root;
  const withoutTrailingSeparators = normalized.replace(/[\\/]+$/u, "");
  const identity =
    withoutTrailingSeparators.length < root.length ? root : withoutTrailingSeparators;
  return platform === "win32" ? identity.toLocaleLowerCase("en-US") : identity;
}

/** 判断两个路径在指定平台的大小写规则下是否表示同一位置。 */
export function samePathIdentity(
  left: string,
  right: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  const pathApi = pathApiForPlatform(platform);
  return (
    normalizePathIdentity(pathApi.resolve(left), platform) ===
    normalizePathIdentity(pathApi.resolve(right), platform)
  );
}
