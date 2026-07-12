import type { ContentDigest } from "#common/index.js";
import type { EvidenceRef } from "#domain/evidence/index.js";
import type { RepositoryId } from "#domain/workspace/index.js";

import type {
  VerificationFailureKind,
  VerificationKind,
  VerificationRequirement,
  VerificationStatus,
} from "../enums/index.js";
import type {
  EVIDENCE_BUNDLE_SCHEMA_VERSION,
  VERIFICATION_PLAN_SCHEMA_VERSION,
} from "../constants/index.js";

/** Verification 命令的确定性、非 Shell 描述。 */
export interface VerificationCommandSpec {
  /** 直接传给进程启动器的可执行文件名。 */
  executable: string;
  /** 直接传给进程启动器的参数数组。 */
  args: readonly string[];
  /** 相对于 Worktree Root 的规范 POSIX 工作目录；空字符串表示 Root。 */
  workingDirectory: string;
  /** 允许读取的环境变量名，不包含环境变量值。 */
  allowedEnvironmentKeys: readonly string[];
}

/** Verification Plan 中的单项检查。 */
export interface VerificationCheck {
  /** 当前 Plan 内稳定且唯一的 Check ID。 */
  checkId: string;
  /** 检查的封闭类别。 */
  kind: VerificationKind;
  /** 检查对交付 Gate 的必要程度。 */
  requirement: VerificationRequirement;
  /** 经过 Human/ProjectProfile 确认的命令描述。 */
  command: VerificationCommandSpec;
  /** 该命令允许使用的最长时间。 */
  timeoutMs: number;
  /** 是否允许由上层策略在失败后执行一次受控重试。 */
  retryable: boolean;
}

/** 一个绑定 Repository、Worktree 和 Revision 的确定性 Verification Plan。 */
export interface VerificationPlan {
  /** Plan Schema 版本。 */
  schemaVersion: typeof VERIFICATION_PLAN_SCHEMA_VERSION;
  /** Plan 稳定标识。 */
  planId: string;
  /** Plan 所属 Repository。 */
  repositoryId: RepositoryId;
  /** Plan 绑定的 Worktree 稳定标识。 */
  worktreeId: string;
  /** Plan 期望的 Git Branch 名称。 */
  expectedBranchName: string;
  /** Verification 依赖的 Base Revision。 */
  baseRevision: string;
  /** Verification 应观察的 Target Revision。 */
  targetRevision: string;
  /** 按 Check ID 排序且不可重复的检查集合。 */
  checks: readonly VerificationCheck[];
}

/** Verification 执行器只允许返回的非 Waived 状态。 */
export type VerificationExecutionStatus =
  VerificationStatus.Passed | VerificationStatus.Failed | VerificationStatus.Blocked;

/** 单个 Check 的执行器结果；原始输出只在当前调用链内流转。 */
export interface VerificationExecutionResult {
  /** 执行器的封闭结果。 */
  status: VerificationExecutionStatus;
  /** 命令退出码；未启动或超时时为空。 */
  exitCode?: number | null;
  /** 原始标准输出，仅用于生成 Digest，不进入 EvidenceBundle。 */
  stdout?: string;
  /** 原始标准错误，仅用于生成 Digest，不进入 EvidenceBundle。 */
  stderr?: string;
  /** 失败或阻断时的稳定诊断分类。 */
  failureKind?: VerificationFailureKind;
  /** 执行开始时间。 */
  startedAt: string;
  /** 执行完成时间。 */
  completedAt: string;
}

/** EvidenceBundle 中单个 Check 的不可变摘要。 */
export interface VerificationCheckEvidence {
  /** 被执行 Check 的稳定标识。 */
  checkId: string;
  /** Check 的封闭类别。 */
  kind: VerificationKind;
  /** Check 的 Gate 必要程度。 */
  requirement: VerificationRequirement;
  /** Check 的最终状态。 */
  status: VerificationStatus;
  /** 失败或阻断时的稳定诊断分类。 */
  failureKind?: VerificationFailureKind;
  /** 命令退出码；未启动或超时时为空。 */
  exitCode?: number | null;
  /** 原始输出摘要的 Content Digest。 */
  outputDigest: ContentDigest;
  /** 执行开始时间。 */
  startedAt: string;
  /** 执行完成时间。 */
  completedAt: string;
  /** 可供 Artifact/Claim 引用的证据条目。 */
  evidence: EvidenceRef;
}

/** 当前验证运行生成的不可变 EvidenceBundle。 */
export interface EvidenceBundle {
  /** EvidenceBundle Schema 版本。 */
  schemaVersion: typeof EVIDENCE_BUNDLE_SCHEMA_VERSION;
  /** 当前 Verification Run 稳定标识。 */
  verificationRunId: string;
  /** 运行使用的 Plan 标识。 */
  planId: string;
  /** Evidence 所属 Repository。 */
  repositoryId: RepositoryId;
  /** Evidence 绑定的 Worktree。 */
  worktreeId: string;
  /** Verification 依赖的 Base Revision。 */
  baseRevision: string;
  /** Evidence 应观察的 Target Revision。 */
  targetRevision: string;
  /** 当前 VerificationPlan 的 Content Digest。 */
  planDigest: ContentDigest;
  /** 所有 Check 聚合后的闭合状态。 */
  status: VerificationStatus;
  /** EvidenceBundle 生成时间。 */
  generatedAt: string;
  /** 按 Plan 顺序生成的 Check Evidence。 */
  checks: readonly VerificationCheckEvidence[];
}
