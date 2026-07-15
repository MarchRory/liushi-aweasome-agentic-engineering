import type { ContentDigest, HarnessError, Result } from "#common/index.js";

import type {
  ExecutorCompatibilityMatrixRecord,
  ExecutorCompatibilityMatrixWriteResult,
} from "./executorCompatibilityStore.contracts.js";

/** Executor Compatibility Matrix 与 Policy 的不可变持久化 Port。 */
export interface ExecutorCompatibilityMatrixStore {
  /** 原子持久化可在重启后完整恢复的 Matrix 与 Policy。 */
  persist(
    record: ExecutorCompatibilityMatrixRecord,
  ): Promise<Result<ExecutorCompatibilityMatrixWriteResult, HarnessError>>;
  /** 按 Matrix Digest 加载并校验不可变 Matrix 与 Policy 记录。 */
  load(
    matrixDigest: ContentDigest,
  ): Promise<Result<ExecutorCompatibilityMatrixRecord, HarnessError>>;
}
