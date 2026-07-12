import { HarnessError, HarnessErrorCode } from "#common/index.js";

/** 创建状态迁移不合法错误。 */
export function invalidTransition(message: string, field: string): HarnessError {
  return new HarnessError(HarnessErrorCode.InvalidStateTransition, message, { field });
}

/** 创建事件流或持久化数据损坏错误。 */
export function corrupt(message: string, field: string): HarnessError {
  return new HarnessError(HarnessErrorCode.CorruptStore, message, { field });
}
