import { HarnessError, HarnessErrorCode } from "#common/index.js";
import type { InstallationRevisionId } from "#domain/installation/index.js";

/** 创建幂等语义冲突错误。 */
export function createInstallationRevisionApprovalConflictError(): HarnessError {
  return new HarnessError(
    HarnessErrorCode.VersionConflict,
    "Idempotency key is already bound to different Installation approval semantics.",
  );
}

/** 创建 Revision 不存在错误。 */
export function createInstallationRevisionNotFoundError(
  revisionId: InstallationRevisionId,
): HarnessError {
  return new HarnessError(
    HarnessErrorCode.InstallationRevisionNotFound,
    "Installation Revision does not exist.",
    { revisionId },
  );
}

/** 将已开始写入后的失败映射为不可自动重试的未知结果。 */
export function createInstallationRevisionCommitOutcomeUnknownError(
  cause: unknown,
  revisionId: InstallationRevisionId | undefined,
  lockFiles: readonly string[],
): HarnessError {
  return cause instanceof HarnessError &&
    cause.code === HarnessErrorCode.InstallationCommitOutcomeUnknown
    ? cause
    : new HarnessError(
        HarnessErrorCode.InstallationCommitOutcomeUnknown,
        "Installation Revision write started but its durable commit outcome is unknown.",
        {
          ...(revisionId === undefined ? {} : { revisionId }),
          recoveryPaths: lockFiles.join(","),
        },
        cause,
      );
}

/** 将未知异常转换为稳定的 Store 错误，同时保留已有 Harness 错误。 */
export function mapInstallationRevisionStoreError(error: unknown, message: string): HarnessError {
  return error instanceof HarnessError
    ? error
    : new HarnessError(HarnessErrorCode.IoFailure, message, {}, error);
}

/** 合并主操作与锁清理阶段的错误。 */
export function combineInstallationRevisionErrors(primary: unknown, secondary: unknown): unknown {
  if (primary === undefined) return secondary;
  if (secondary === undefined) return primary;
  return new AggregateError(
    [primary, secondary],
    "Installation Revision operation and cleanup failed.",
  );
}
