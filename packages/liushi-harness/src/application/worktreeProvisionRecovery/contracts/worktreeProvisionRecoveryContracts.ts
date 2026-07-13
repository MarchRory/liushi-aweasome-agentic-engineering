import type { ContentDigest } from "#common/index.js";
import type { ActionJournalStatus } from "#domain/actionJournal/index.js";

import type { WORKTREE_PROVISION_RECOVERY_SCHEMA_VERSION } from "../constants/index.js";
import type {
  WorktreeProvisionRecoveryDiagnosticCode,
  WorktreeProvisionRecoveryInspectionStatus,
} from "#application/ports/worktreeProvisionRecoveryInspector/index.js";

/** 只读评估一个未知 Worktree Provision Action 的输入。 */
export interface AssessWorktreeProvisionRecoveryInput {
  /** CodingTask 所属 Workspace。 */
  readonly workspaceId: string;
  /** 需要恢复的 CodingTask。 */
  readonly codingTaskId: string;
  /** 原 Worktree Provision Action。 */
  readonly actionId: string;
}

/** 向 Human 返回的脱敏 Worktree Provision 恢复评估。 */
export interface WorktreeProvisionRecoveryAssessment {
  /** 恢复评估的 Schema 版本。 */
  readonly schemaVersion: typeof WORKTREE_PROVISION_RECOVERY_SCHEMA_VERSION;
  /** CodingTask 所属 Workspace。 */
  readonly workspaceId: string;
  /** 被评估的 CodingTask。 */
  readonly codingTaskId: string;
  /** 被评估的原 Action。 */
  readonly actionId: string;
  /** CodingTask 绑定的 Repository。 */
  readonly repositoryId: string;
  /** CodingTask 绑定的 Managed Worktree。 */
  readonly worktreeId: string;
  /** 评估时读取到的 Action Journal 状态。 */
  readonly journalStatus: ActionJournalStatus;
  /** 评估时读取到的最后 Journal Sequence。 */
  readonly journalLastSequence: number;
  /** 只读现场检查得到的闭合状态。 */
  readonly status: WorktreeProvisionRecoveryInspectionStatus;
  /** 不含本机路径和命令输出的稳定诊断。 */
  readonly diagnostics: readonly WorktreeProvisionRecoveryDiagnosticCode[];
  /** 支撑本次评估的稳定证据标识。 */
  readonly evidenceIds: readonly string[];
  /** Human 确认时必须原样绑定的规范化评估摘要。 */
  readonly digest: ContentDigest;
}

/** Human 对确定评估执行对账的版本化命令 Payload。 */
export interface ReconcileWorktreeProvisionCommandPayload {
  /** CodingTask 所属 Workspace。 */
  readonly workspaceId: string;
  /** 原 Worktree Provision Action。 */
  readonly actionId: string;
  /** Human 已检查并确认的评估摘要。 */
  readonly expectedAssessmentDigest: ContentDigest;
}
