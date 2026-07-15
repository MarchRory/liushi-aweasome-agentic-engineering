import { HarnessError, HarnessErrorCode, failure, type Result } from "#common/index.js";

/** 创建统一的 Installation Revision 持久化损坏结果。 */
export function corruptRevision(message: string, cause?: unknown): Result<never, HarnessError> {
  return failure(new HarnessError(HarnessErrorCode.CorruptStore, message, {}, cause));
}
