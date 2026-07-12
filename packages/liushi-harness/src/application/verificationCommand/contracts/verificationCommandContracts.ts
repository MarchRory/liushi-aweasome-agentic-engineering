import type { ContentDigest } from "#common/index.js";
import type { VerificationPlan } from "#domain/verification/index.js";
import type { FailureTaxonomy } from "#domain/workflow/index.js";

/** Verification Run Command 的持久化载荷。 */
export interface RunVerificationCommandPayload {
  /** CodingTask 所属 Workspace。 */
  readonly workspaceId: string;
  /** 本次 Journal Action ID。 */
  readonly actionId: string;
  /** 验证运行标识。 */
  readonly verificationRunId: string;
  /** 当前 CodingTask Attempt 序号。 */
  readonly attemptNumber: number;
  /** Worktree Root 明文的摘要绑定。 */
  readonly worktreeRootDigest: ContentDigest;
  /** 已由上游确认的完整 Verification Plan。 */
  readonly plan: VerificationPlan;
  /** Check 明确失败时采用的业务失败分类。 */
  readonly failedVerificationTaxonomy: FailureTaxonomy;
}

/** 只在当前进程存在的 Verification Runtime 输入。 */
export interface VerificationCommandRuntimeContext {
  /** 本机 Worktree Root，不进入 Receipt、Journal 或 Evidence。 */
  readonly worktreeRoot: string;
}
