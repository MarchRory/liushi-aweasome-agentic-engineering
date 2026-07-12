import type { HarnessError, Result } from "#common/index.js";
import type { WorktreeBinding } from "#domain/codingTask/index.js";
import type { RepositoryId } from "#domain/workspace/index.js";

import type {
  WorktreeChangeKind,
  WorktreeGitOperation,
  WorktreeInspectionDiagnosticCode,
  WorktreeInspectionStatus,
} from "../enums/index.js";

/** Worktree 只读检查的输入。 */
export interface InspectWorktreeInput {
  /** Repository 的稳定标识。 */
  repositoryId: RepositoryId;
  /** 仅供本次运行使用的本机 Repository Root，不得进入报告或诊断文本。 */
  repositoryRoot: string;
  /** 期望检查的 Worktree 绑定。 */
  worktreeBinding: WorktreeBinding;
  /** 创建 CodingTask 时锁定的 Base Revision。 */
  baseRevision: string;
  /** 已由上游声明且必须保持规范形式的 Write Set。 */
  writeSet: readonly string[];
}

/** Git 报告的一项规范化工作区变化。 */
export interface WorktreeChange {
  /** 变化后的 Repository 相对 POSIX 路径。 */
  path: string;
  /** Rename 或 Copy 的原始 Repository 相对 POSIX 路径。 */
  originalPath?: string;
  /** 变化的闭合分类。 */
  kind: WorktreeChangeKind;
}

/** 不包含运行时绝对路径的稳定诊断。 */
export interface WorktreeInspectionDiagnostic {
  /** 诊断的闭合分类。 */
  code: WorktreeInspectionDiagnosticCode;
  /** 诊断关联的 Git 操作。 */
  operation?: WorktreeGitOperation;
  /** 诊断关联的规范相对路径；绝不允许使用绝对路径。 */
  path?: string;
}

/** Worktree 只读检查的脱敏报告。 */
export interface WorktreeInspectionReport {
  /** Repository 的稳定标识。 */
  repositoryId: RepositoryId;
  /** Worktree 的稳定标识。 */
  worktreeId: string;
  /** Worktree 相对于 Repository Root 的规范 POSIX 路径。 */
  worktreeRelativePath: string;
  /** 期望的分支名称。 */
  expectedBranchName: string;
  /** Git 读取到的实际分支名称；Detached HEAD 时缺失。 */
  actualBranchName?: string;
  /** 调用方声明的 Base Revision。 */
  declaredBaseRevision: string;
  /** Git 解析后的 Base Commit Revision。 */
  resolvedBaseRevision?: string;
  /** Git 读取到的当前 HEAD Revision。 */
  actualHeadRevision?: string;
  /** 检查的总体闭合状态。 */
  status: WorktreeInspectionStatus;
  /** 规范化后的声明 Write Set。 */
  writeSet: readonly string[];
  /** 所有受 Git 变化影响的规范相对路径。 */
  changedPaths: readonly string[];
  /** 越过 Write Set 的规范相对路径。 */
  writeSetViolations: readonly string[];
  /** Git 变化的结构化明细。 */
  changes: readonly WorktreeChange[];
  /** 稳定且不泄露运行时路径的诊断集合。 */
  diagnostics: readonly WorktreeInspectionDiagnostic[];
}

/** Worktree 只读检查 Port。 */
export interface WorktreeInspectorPort {
  /** 检查 Worktree、基线和声明 Write Set，不执行任何写操作。 */
  inspect(input: InspectWorktreeInput): Promise<Result<WorktreeInspectionReport, HarnessError>>;
}
