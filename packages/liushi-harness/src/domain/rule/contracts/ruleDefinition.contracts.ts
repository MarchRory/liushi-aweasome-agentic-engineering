import type { ActorRef, ContentDigest, RULE_SCHEMA_VERSION } from "#common/index.js";
import type { RepositoryId } from "#domain/workspace/index.js";

import type {
  RuleCategory,
  RuleEnforcement,
  RuleFileKind,
  RuleOperation,
  RuleSourceKind,
  RuleStatus,
} from "../enums/index.js";
import type { RuleScope } from "./ruleScope.contracts.js";

/** Rule 对可操作目标的结构化选择条件。 */
export interface RuleSelector {
  /** 允许命中的 Repository；缺省表示不按 Repository 过滤。 */
  repositoryIds?: readonly RepositoryId[];
  /** 使用正斜杠的相对路径 Glob；同一维度内按 OR 解析。 */
  pathGlobs?: readonly string[];
  /** 小写语言 Registry ID；同一维度内按 OR 解析。 */
  languages?: readonly string[];
  /** 允许命中的文件类别。 */
  fileKinds?: readonly RuleFileKind[];
  /** 允许命中的操作类别。 */
  operations?: readonly RuleOperation[];
}

/** Rule Provenance 使用的最小、可失效来源引用。 */
export interface RuleSourceRef {
  /** 来源的封闭类别。 */
  kind: RuleSourceKind;
  /** 来源系统内稳定且不包含原文的定位 ID。 */
  sourceId: string;
  /** 来源支持 Revision 时记录的不可变版本。 */
  revision?: string;
  /** 对采集内容计算的稳定 Digest。 */
  digest?: ContentDigest;
}

/** Rule 推荐或禁止的代码示例引用。 */
export interface RuleCodeExampleRef {
  /** 示例所在 Repository。 */
  repositoryId: RepositoryId;
  /** 示例绑定的不可变 Repository Revision。 */
  revision: string;
  /** 示例文件在 Repository 内的规范相对路径。 */
  relativePath: string;
  /** 示例片段存在独立摘要时记录的 Content Digest。 */
  contentDigest?: ContentDigest;
}

/** 一个可解析、可执行并可审计的项目 Rule。 */
export interface RuleDefinition {
  /** Rule Definition schema 版本。 */
  schemaVersion: typeof RULE_SCHEMA_VERSION;
  /** 经 Registry 校验且跨 Revision 稳定的 Rule ID。 */
  ruleId: string;
  /** Rule 内容的三段式 SemVer。 */
  version: string;
  /** Rule 当前生命周期状态。 */
  status: RuleStatus;
  /** Rule 约束的质量或业务维度。 */
  category: RuleCategory;
  /** Rule 违反时的处理方式。 */
  enforcement: RuleEnforcement;
  /** 将同一语义约束归组的显式 Registry Key。 */
  familyKey: string;
  /** 表示该 Family 当前要求结果的显式 Registry Key。 */
  outcomeKey: string;
  /** Rule 的身份边界与最大生效范围。 */
  scope: RuleScope;
  /** Repository、路径、语言、文件类型和操作条件。 */
  selector: RuleSelector;
  /** Agent、Human 和 Validator 使用的明确规则陈述。 */
  statement: string;
  /** 解释规则存在原因、风险和不变量。 */
  rationale: string;
  /** 能够机械执行该 Rule 的 Validator Registry ID。 */
  validatorIds: readonly string[];
  /** 解析或执行该 Rule 前必须具备的 Capability Registry ID。 */
  requiredCapabilityIds: readonly string[];
  /** 证明 Rule 来源和有效性的最小引用。 */
  sourceRefs: readonly RuleSourceRef[];
  /** 来源变化后应使 Rule 失效的引用集合。 */
  invalidationRefs: readonly RuleSourceRef[];
  /** 经确认且适合新代码模仿的示例引用。 */
  approvedExampleRefs: readonly RuleCodeExampleRef[];
  /** 遗留、错误或禁止复制的示例引用。 */
  negativeExampleRefs: readonly RuleCodeExampleRef[];
  /** 显式声明不能与该 Rule 同时生效的 Rule ID。 */
  conflictsWithRuleIds: readonly string[];
  /** 负责确认和维护该 Rule 的 Actor。 */
  owner: ActorRef;
  /** Active Rule 最后一次可信评审的 ISO 8601 UTC 时间。 */
  reviewedAt?: string;
  /** 对除 digest 外全部机器字段计算的 RFC 8785 Digest。 */
  digest: ContentDigest;
}

/** 计算 Rule Digest 时排除自引用 digest 字段的规范输入。 */
export type RuleDigestInput = Omit<RuleDefinition, "digest">;
