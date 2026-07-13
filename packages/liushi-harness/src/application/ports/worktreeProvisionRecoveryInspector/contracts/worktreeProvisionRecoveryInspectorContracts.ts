import type { HarnessError, Result } from "#common/index.js";
import type { WorktreeBinding } from "#domain/codingTask/index.js";
import type { RepositoryId } from "#domain/workspace/index.js";

import type {
  WorktreeProvisionRecoveryDiagnosticCode,
  WorktreeProvisionRecoveryInspectionStatus,
} from "../enums/index.js";

/** 专用 Worktree Provision 恢复检查输入。 */
export interface InspectWorktreeProvisionRecoveryInput {
  /** 需要检查的 Repository。 */
  readonly repositoryId: RepositoryId;
  /** 仅供 Adapter 使用，不得进入输出。 */
  readonly repositoryRoot: string;
  /** CodingTask 权威声明的 Managed Worktree 绑定。 */
  readonly worktreeBinding: WorktreeBinding;
  /** CodingTask 创建时冻结的 Base Revision。 */
  readonly baseRevision: string;
  /** CodingTask 权威声明的规范化 Write Set。 */
  readonly writeSet: readonly string[];
}

/** Worktree Provision 恢复检查报告。 */
export interface WorktreeProvisionRecoveryInspectionReport {
  /** 被检查的 Repository。 */
  readonly repositoryId: RepositoryId;
  /** 被检查的 Managed Worktree。 */
  readonly worktreeId: string;
  /** 联合现场证据得到的稳定结论。 */
  readonly status: WorktreeProvisionRecoveryInspectionStatus;
  /** 不泄露本机路径或命令输出的稳定诊断。 */
  readonly diagnostics: readonly WorktreeProvisionRecoveryDiagnosticCode[];
}

/** 只读检查 Worktree Provision 外部事实的专用 Port。 */
export interface WorktreeProvisionRecoveryInspectorPort {
  /** 只读检查路径、Registry、分支与 Worktree 状态。 */
  inspect(
    input: InspectWorktreeProvisionRecoveryInput,
  ): Promise<Result<WorktreeProvisionRecoveryInspectionReport, HarnessError>>;
}
