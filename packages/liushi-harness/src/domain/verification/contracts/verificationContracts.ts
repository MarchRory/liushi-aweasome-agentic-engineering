import type { ContentDigest } from "#common/index.js";
import type { ApprovalId } from "#domain/approval/identifiers/index.js";
import type { EvidenceRef } from "#domain/evidence/index.js";
import type { ApplicableRuleEntry, RuleResolutionTarget } from "#domain/rule/index.js";
import type { RepositoryId } from "#domain/workspace/index.js";

import type {
  VerificationCheckSelectionReason,
  VerificationCheckSelectionStatus,
  VerificationFailureKind,
  VerificationImpactDiagnosticCode,
  VerificationImpactSelectionStatus,
  VerificationKind,
  VerificationRequirement,
  VerificationSelectionMode,
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

/** 经 Human/G8 确认并可用于项目影响面选择的 Verification Check。 */
export interface ProjectVerificationCheck extends VerificationCheck {
  /** Check 的封闭影响面选择方式。 */
  selectionMode: VerificationSelectionMode;
  /** Changed Paths 模式使用的规范 Repository 相对 Glob。 */
  pathGlobs?: readonly string[];
  /** 可触发该 Check 的 Rule Validator Registry ID。 */
  validatorIds: readonly string[];
}

/** Verification 影响面选择器的完整纯函数输入。 */
export interface VerificationImpactSelectorInput {
  /** 当前选择所绑定的 Repository。 */
  repositoryId: RepositoryId;
  /** 当前变更涉及的 Repository 相对路径。 */
  changedPaths: readonly string[];
  /** 经 Human/G8 确认的项目 Check 集合。 */
  checks: readonly ProjectVerificationCheck[];
  /** 当前上下文适用的 Rule 集合。 */
  applicableRules: readonly ApplicableRuleEntry[];
  /** Rule Bundle 绑定的完整显式目标集合。 */
  ruleTargets: readonly RuleResolutionTarget[];
}

/** 单个候选 Check 的确定性影响面判定。 */
export interface VerificationImpactCheckSelection {
  /** 被判定的项目 Check。 */
  check: ProjectVerificationCheck;
  /** 该 Check 被选择或排除。 */
  status: VerificationCheckSelectionStatus;
  /** 该判定的稳定原因。 */
  reason: VerificationCheckSelectionReason;
  /** 实际命中且按稳定顺序排列的变更路径。 */
  matchedPaths: readonly string[];
  /** 通过 Validator 映射贡献选择结果的 Rule ID。 */
  contributingRuleIds: readonly string[];
}

/** Verification 影响面选择器的 fail-closed 诊断。 */
export interface VerificationImpactDiagnostic {
  /** 稳定机器诊断代码。 */
  code: VerificationImpactDiagnosticCode;
  /** 诊断关联的 Rule ID；项目级诊断不存在该字段。 */
  ruleId?: string;
  /** 诊断关联且按稳定顺序排列的 Validator ID。 */
  validatorIds: readonly string[];
  /** 诊断关联且按稳定顺序排列的 Repository 相对路径。 */
  paths?: readonly string[];
  /** 面向审计的稳定说明。 */
  message: string;
}

/** 尚未生成命令、Digest 或 VerificationPlan 的纯影响面选择结果。 */
export interface VerificationImpactSelection {
  /** 结果是否满足继续规划所需的不变量。 */
  status: VerificationImpactSelectionStatus;
  /** 每个候选 Check 的判定，按 Check ID 稳定排序。 */
  checks: readonly VerificationImpactCheckSelection[];
  /** 按稳定身份排序的 fail-closed 诊断。 */
  diagnostics: readonly VerificationImpactDiagnostic[];
}

/** Verification Plan 选择所绑定的权威 Profile 与 Rule 来源。 */
export interface VerificationPlanSourceRefs {
  /** 多仓 Project Profile Bundle 摘要。 */
  projectProfileBundleDigest: ContentDigest;
  /** 当前仓库 Project Profile 摘要。 */
  projectProfileDigest: ContentDigest;
  /** G8 批准的 Project Profile Proposal Artifact 摘要。 */
  proposalArtifactDigest: ContentDigest;
  /** G8 批准本次 Profile 编译的 Approval ID。 */
  profileApprovalId: ApprovalId;
  /** 当前 Applicable Rule Bundle 摘要。 */
  applicableRuleBundleDigest: ContentDigest;
}

/** 一个绑定来源、Repository、Worktree 和 Revision 的确定性 Verification Plan。 */
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
  /** 生成当前 Plan 的权威 Profile、Approval 与 Rule 来源。 */
  sourceRefs: VerificationPlanSourceRefs;
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
