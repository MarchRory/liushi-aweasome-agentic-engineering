import { normalize, resolve } from "node:path";

/** 将路径规范化为用于 identity 比较的稳定值。 */
export function normalizePathIdentity(
  value: string,
  platform: NodeJS.Platform = process.platform,
): string {
  const normalized = normalize(value).replace(/[\\/]+$/u, "");
  return platform === "win32" ? normalized.toLocaleLowerCase("en-US") : normalized;
}

/** 判断两个路径在指定平台的大小写规则下是否表示同一位置。 */
export function samePathIdentity(
  left: string,
  right: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  return (
    normalizePathIdentity(resolve(left), platform) ===
    normalizePathIdentity(resolve(right), platform)
  );
}
