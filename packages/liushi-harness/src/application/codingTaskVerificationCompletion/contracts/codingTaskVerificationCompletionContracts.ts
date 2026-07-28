import type { CommandEnvelope, CommandReceipt } from "#application/command/index.js";
import type { RunVerificationCommandPayload } from "#application/verificationCommand/index.js";
import type { PrReadyArtifact } from "#domain/repositoryDelivery/index.js";
import type { EvidenceBundle } from "#domain/verification/index.js";

import type { CODING_TASK_VERIFICATION_COMPLETION_REPORT_SCHEMA_VERSION } from "../constants/index.js";
import type {
  CodingTaskVerificationCompletionStage,
  CodingTaskVerificationCompletionStatus,
} from "../enums/index.js";

/** Verification Completion Tail 的唯一执行输入。 */
export interface CodingTaskVerificationCompletionInput {
  /** 已绑定权威 Plan 与 CodingTask Version 的 Verification Command。 */
  readonly command: CommandEnvelope<RunVerificationCommandPayload>;
  /** 仅在当前进程使用的受信 Worktree Root。 */
  readonly runtime: {
    /** Verification 必须执行的规范绝对 Worktree Root。 */
    readonly worktreeRoot: string;
  };
}

/** Verification Command、Evidence 与 PR-ready 的统一结果。 */
export interface CodingTaskVerificationCompletionReport {
  /** Report 的稳定 Schema 版本。 */
  readonly schemaVersion: typeof CODING_TASK_VERIFICATION_COMPLETION_REPORT_SCHEMA_VERSION;
  /** 当前尾链的封闭业务状态。 */
  readonly status: CodingTaskVerificationCompletionStatus;
  /** 未进入 ReviewReady 时停止的稳定阶段。 */
  readonly stoppedStage?: CodingTaskVerificationCompletionStage;
  /** Application Command Gateway 返回的权威回执。 */
  readonly receipt: CommandReceipt;
  /** Verification 已形成稳定结果时的强一致 EvidenceBundle。 */
  readonly evidenceBundle?: EvidenceBundle;
  /** 仅 ReviewReady 状态存在的 PR-ready Artifact。 */
  readonly prReadyArtifact?: PrReadyArtifact;
}
