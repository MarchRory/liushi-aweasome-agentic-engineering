import type { HarnessErrorCode } from "#common/index.js";
import type { ParentDirectoryDurability } from "#infrastructure/persistence/fileEventStore/index.js";

import type { ImmutableFileParentDirectoryPolicy } from "../enums/index.js";

/** create-only 不可变文件 primitive 的输入。 */
export interface CreateOnlyImmutableFileInput {
  /** 已由调用方 adapter 校验的绝对目标路径。 */
  readonly outputFilePath: string;
  /** 将完整写入并持久化的 UTF-8 字节。 */
  readonly content: Uint8Array;
  /** 父目录耐久化策略。 */
  readonly parentDirectoryDurability: ParentDirectoryDurability;
  /** 调用方必须显式选择父目录处理策略。 */
  readonly parentDirectoryPolicy: ImmutableFileParentDirectoryPolicy;
  /** 发生持久化结果未知时使用的上层错误码。 */
  readonly commitOutcomeUnknownCode: HarnessErrorCode;
  /** 冲突时使用的上层错误码。 */
  readonly conflictErrorCode: HarnessErrorCode;
  /** 错误消息中的文件领域名称。 */
  readonly artifactName: string;
}
