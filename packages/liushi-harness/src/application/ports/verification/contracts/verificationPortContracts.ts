import type { HarnessError, Result } from "#common/index.js";
import type {
  EvidenceBundle,
  VerificationCheck,
  VerificationExecutionResult,
  VerificationPlan,
} from "#domain/verification/index.js";

/** 单个 Verification Check 的运行时执行请求。 */
export interface VerificationExecutionRequest {
  /** 当前运行使用的完整 Plan。 */
  plan: VerificationPlan;
  /** 当前待执行的 Check。 */
  check: VerificationCheck;
  /** 仅供本次执行使用的真实 Worktree Root，不进入 EvidenceBundle。 */
  worktreeRoot: string;
}

/** 执行 Verification 命令或测试的 Port。 */
export interface VerificationExecutorPort {
  /** 执行一个已确认的 Check；Port 实现不得修改业务代码。 */
  execute(
    input: VerificationExecutionRequest,
  ): Promise<Result<VerificationExecutionResult, HarnessError>>;
}

/** 运行一组 Verification Check 所需的应用层输入。 */
export interface RunVerificationInput {
  /** 当前 Verification Run 的稳定标识。 */
  verificationRunId: string;
  /** 已由上游确认的 Verification Plan。 */
  plan: VerificationPlan;
  /** 仅供本次执行使用的真实 Worktree Root。 */
  worktreeRoot: string;
}

/** Verification Use Case 输出的只读 EvidenceBundle Port。 */
export interface VerificationRunnerPort {
  /** 执行 Plan 并组装不含原始输出的 EvidenceBundle。 */
  run(input: RunVerificationInput): Promise<Result<EvidenceBundle, HarnessError>>;
}
