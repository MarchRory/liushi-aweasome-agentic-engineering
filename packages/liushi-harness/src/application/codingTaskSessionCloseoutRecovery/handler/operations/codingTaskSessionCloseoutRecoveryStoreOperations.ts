import type { CodingTaskSessionCloseoutRecoveryStateStore } from "#application/ports/index.js";
import { failure, type HarnessError, type Result } from "#common/index.js";

import type { CodingTaskSessionCloseoutRecoveryState } from "../../state/index.js";
import { recoveryStoreOutcomeUnknown } from "../errors/index.js";

/** 以 fail-closed 方式调用 Recovery Store 的写操作。 */
export async function persistRecoveryState<T>(
  operation: () => Promise<Result<T, HarnessError>>,
): Promise<Result<T, HarnessError>> {
  try {
    return await operation();
  } catch (error) {
    return failure(recoveryStoreOutcomeUnknown(error));
  }
}

/** 以 CAS 写入由状态迁移生成的 successor。 */
export function replaceRecoveryState(
  store: CodingTaskSessionCloseoutRecoveryStateStore<CodingTaskSessionCloseoutRecoveryState>,
  current: CodingTaskSessionCloseoutRecoveryState,
  state: CodingTaskSessionCloseoutRecoveryState,
): Promise<Result<CodingTaskSessionCloseoutRecoveryState, HarnessError>> {
  return persistRecoveryState(() => store.replace({ expectedVersion: current.version, state }));
}
