import { ParentDirectorySyncStatus } from "../enums/index.js";

/** 判断父目录刷新结果是否满足提交协议要求的耐久语义。 */
export function isDurableParentDirectorySyncStatus(status: ParentDirectorySyncStatus): boolean {
  return (
    status === ParentDirectorySyncStatus.Synced ||
    status === ParentDirectorySyncStatus.PlatformEquivalent
  );
}
