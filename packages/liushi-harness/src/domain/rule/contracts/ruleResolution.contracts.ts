import type { ContentDigest, RULE_BUNDLE_SCHEMA_VERSION } from "#common/index.js";
import type { TaskId } from "#domain/task/index.js";
import type { RepositoryId } from "#domain/workspace/index.js";

import type {
  RuleConflictKind,
  RuleContextDriftKind,
  RuleDefinitionViolationKind,
  RuleEnforcement,
  RuleExclusionReason,
  RuleFileKind,
  RuleOperation,
  RuleResolutionStatus,
  RuleStatus,
} from "../enums/index.js";
import type { RULE_RESOLVER_VERSION } from "../constants/index.js";
import type { RuleCodeExampleRef, RuleSelector } from "./ruleDefinition.contracts.js";
import type { RepositoryRuleContextRef, WorkspaceRuleContextRef } from "./ruleCatalog.contracts.js";
import type { RuleScope } from "./ruleScope.contracts.js";

/** Rule Resolver 显式评估的单个文件或资源目标。 */
export interface RuleResolutionTarget {
  /** Resolution Context 内稳定且唯一的目标 ID。 */
  targetId: string;
  /** 目标所属 Repository。 */
  repositoryId: RepositoryId;
  /** 目标在 Repository 内的规范相对路径。 */
  relativePath: string;
  /** 目标语言的开放 Registry ID。 */
  language: string;
  /** 目标的封闭文件类别。 */
  fileKind: RuleFileKind;
  /** Task 计划对目标执行的操作。 */
  operation: RuleOperation;
}

/** Applicable Rule Resolution 所需的完整显式上下文。 */
export interface RuleResolutionContext {
  /** 当前 Task ID。 */
  taskId: TaskId;
  /** 当前 Workspace Graph 身份。 */
  workspaceRef: WorkspaceRuleContextRef;
  /** 当前 Task 涉及的 Repository/Profile 身份集合。 */
  repositoryRefs: readonly RepositoryRuleContextRef[];
  /** Read/Write Set 展开的显式目标集合。 */
  targets: readonly RuleResolutionTarget[];
  /** 当前运行环境可执行的 Validator ID。 */
  availableValidatorIds: readonly string[];
  /** 当前运行环境已经注册的 Capability ID。 */
  availableCapabilityIds: readonly string[];
}

/** 进入 Applicable Rule Bundle 的可执行 Rule 摘要。 */
export interface ApplicableRuleEntry {
  /** Rule 的稳定 ID。 */
  ruleId: string;
  /** Rule 的 SemVer。 */
  version: string;
  /** Rule 机器字段的稳定 Digest。 */
  ruleDigest: ContentDigest;
  /** Rule 的显式 Family Key。 */
  familyKey: string;
  /** Rule 的显式 Outcome Key。 */
  outcomeKey: string;
  /** Rule 违反时的执行方式。 */
  enforcement: RuleEnforcement;
  /** Rule 的身份 Scope。 */
  scope: RuleScope;
  /** Rule 的目标选择器。 */
  selector: RuleSelector;
  /** Rule 的明确机器真源陈述。 */
  statement: string;
  /** 实际命中该 Rule 的目标 ID。 */
  matchedTargetIds: readonly string[];
  /** 该 Rule 声明的 Validator ID。 */
  validatorIds: readonly string[];
  /** 该 Rule 声明的 Capability ID。 */
  requiredCapabilityIds: readonly string[];
  /** 可注入编码上下文的已确认正向示例。 */
  approvedExampleRefs: readonly RuleCodeExampleRef[];
}

/** 一个目标与 Rule Family 的最终 Enforcement 解析结果。 */
export interface RuleTargetFamilyResolution {
  /** 被解析的目标 ID。 */
  targetId: string;
  /** 被解析的 Rule Family。 */
  familyKey: string;
  /** 所有命中 Rule 中最严格的 Enforcement。 */
  effectiveEnforcement: RuleEnforcement;
  /** 共同形成该结果的 Rule ID。 */
  contributingRuleIds: readonly string[];
}

/** 未进入执行集合但保留用于 Explain/Audit 的 Rule。 */
export interface ExcludedRuleEntry {
  /** 被排除 Rule 的稳定 ID。 */
  ruleId: string;
  /** 被排除 Rule 的 SemVer。 */
  version: string;
  /** 被排除 Rule 的生命周期状态。 */
  status: RuleStatus;
  /** 确定性排除原因。 */
  reason: RuleExclusionReason;
}

/** 参与结构化冲突的最小 Rule Revision 引用。 */
export interface RuleConflictRef {
  /** 冲突 Rule 的稳定 ID。 */
  ruleId: string;
  /** 冲突 Rule 的 SemVer。 */
  version: string;
  /** 冲突 Rule 的 Content Digest。 */
  ruleDigest: ContentDigest;
}

/** Resolver 无法自动消解的结构化 Rule 冲突。 */
export interface RuleConflict {
  /** 冲突的封闭类型。 */
  kind: RuleConflictKind;
  /** 参与冲突且按稳定顺序排列的 Rule 引用。 */
  rules: readonly RuleConflictRef[];
  /** 受冲突影响的目标 ID。 */
  targetIds: readonly string[];
  /** 用于审计和 Human DecisionRequest 的稳定说明。 */
  message: string;
}

/** Blocking Rule 所需但运行环境未注册的 Validator。 */
export interface MissingRuleValidator {
  /** 缺失 Validator 所属 Rule。 */
  ruleId: string;
  /** 缺失的 Validator Registry ID。 */
  validatorId: string;
  /** 需要该 Validator 的目标 ID。 */
  targetIds: readonly string[];
}

/** Applicable Rule 所需但运行环境未注册的 Capability。 */
export interface MissingRuleCapability {
  /** 缺失 Capability 所属 Rule。 */
  ruleId: string;
  /** 缺失的 Capability Registry ID。 */
  capabilityId: string;
  /** 缺失 Capability 所属 Rule 的 Enforcement。 */
  enforcement: RuleEnforcement;
  /** 需要该 Capability 的目标 ID。 */
  targetIds: readonly string[];
}

/** Catalog Context 与当前 Task Context 的确定性漂移。 */
export interface RuleContextDrift {
  /** 漂移字段的封闭类型。 */
  kind: RuleContextDriftKind;
  /** 发生漂移的 Repository；Workspace 级漂移不存在该字段。 */
  repositoryId?: RepositoryId;
  /** Catalog Digest 绑定的期望值。 */
  expected: string;
  /** 当前 Resolution Context 的实际值。 */
  actual: string;
}

/** Resolver 纵深防御发现的非法 Rule Definition。 */
export interface RuleDefinitionViolation {
  /** 被违反的封闭 Rule 不变量。 */
  kind: RuleDefinitionViolationKind;
  /** 非法 Rule 的稳定 ID。 */
  ruleId: string;
  /** 非法 Rule 的 SemVer。 */
  version: string;
  /** 面向审计与修复的稳定说明。 */
  message: string;
}

/** 尚未计算 Bundle Digest 的纯领域解析结果。 */
export interface ResolvedRuleBundle {
  /** Applicable Rule Bundle Schema Version。 */
  schemaVersion: typeof RULE_BUNDLE_SCHEMA_VERSION;
  /** 生成该结果的确定性 Resolver Version。 */
  resolverVersion: typeof RULE_RESOLVER_VERSION;
  /** 当前 Task ID。 */
  taskId: TaskId;
  /** 解析时绑定的 Workspace Graph 身份。 */
  workspaceRef: WorkspaceRuleContextRef;
  /** 解析时绑定的 Repository/Profile 身份集合。 */
  repositoryRefs: readonly RepositoryRuleContextRef[];
  /** 解析时绑定的显式目标集合。 */
  targets: readonly RuleResolutionTarget[];
  /** 命中并可进入执行上下文的 Active Rule。 */
  rules: readonly ApplicableRuleEntry[];
  /** 每个目标和 Family 的最终 Enforcement。 */
  targetFamilyResolutions: readonly RuleTargetFamilyResolution[];
  /** 未进入执行集合的 Rule 审计项。 */
  excluded: readonly ExcludedRuleEntry[];
  /** 需要 Human 解决的结构化冲突。 */
  conflicts: readonly RuleConflict[];
  /** Blocking Rule 缺失的 Validator。 */
  missingValidators: readonly MissingRuleValidator[];
  /** Applicable Rule 缺失的 Capability。 */
  missingCapabilities: readonly MissingRuleCapability[];
  /** Catalog 与当前上下文之间的 Revision 漂移。 */
  contextDrifts: readonly RuleContextDrift[];
  /** 绕过 Schema 调用时仍会阻断的 Rule Definition 违规。 */
  definitionViolations: readonly RuleDefinitionViolation[];
  /** Bundle 是否可作为执行依据。 */
  resolutionStatus: RuleResolutionStatus;
}

/** 可持久化、可绑定 Plan 与 Evidence 的 Applicable Rule Bundle。 */
export interface ApplicableRuleBundle extends ResolvedRuleBundle {
  /** 对全部执行相关字段计算的 RFC 8785 Digest。 */
  digest: ContentDigest;
}

/** 计算 Applicable Rule Bundle Digest 时排除审计型 excluded 与自引用 digest。 */
export type ApplicableRuleBundleDigestInput = Omit<ResolvedRuleBundle, "excluded">;
