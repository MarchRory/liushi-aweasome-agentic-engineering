import type {
  VerificationExecutionStatus,
  VerificationFailureKind,
} from "#domain/verification/index.js";

/** Mock Verification Executor 为单个 Check 注入的确定性结果。 */
export interface MockVerificationOutcome {
  /** Mock 应返回的执行状态。 */
  status: VerificationExecutionStatus;
  /** 可选的命令退出码。 */
  exitCode?: number | null;
  /** 仅在进程内用于生成 Digest 的标准输出。 */
  stdout?: string;
  /** 仅在进程内用于生成 Digest 的标准错误。 */
  stderr?: string;
  /** 预置的稳定失败分类。 */
  failureKind?: VerificationFailureKind;
}
