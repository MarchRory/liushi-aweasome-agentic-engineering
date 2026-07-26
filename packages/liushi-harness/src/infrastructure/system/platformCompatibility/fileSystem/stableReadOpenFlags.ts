import { constants } from "node:fs";

/** 返回只读打开标志，并在当前平台支持时启用不跟随符号链接。 */
export function resolveStableReadOpenFlags(): number {
  const noFollowFlag = (constants as unknown as { readonly O_NOFOLLOW?: number }).O_NOFOLLOW;
  return constants.O_RDONLY | (noFollowFlag ?? 0);
}
