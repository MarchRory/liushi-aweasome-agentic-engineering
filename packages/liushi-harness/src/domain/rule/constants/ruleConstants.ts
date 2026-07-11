import { RuleEnforcement, RuleScopeLevel } from "../enums/index.js";

/** 当前确定性 Rule Resolver 实现版本。 */
export const RULE_RESOLVER_VERSION = "1.0.0";

/** Rule、Catalog、Validator 和 Capability 开放 Registry ID 的格式。 */
export const RULE_REGISTRY_ID_PATTERN = /^[a-z][a-z0-9]*(?:[._:/-][a-z0-9]+)*$/;

/** Rule Version 使用的严格三段式 SemVer 格式。 */
export const RULE_VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/** Rule 普通说明字段的最大字符数。 */
export const MAX_RULE_TEXT_LENGTH = 2_000;

/** Rule Path、Glob 或 Source Locator 的最大字符数。 */
export const MAX_RULE_LOCATOR_LENGTH = 500;

/** Rule 单个数组字段允许的最大条目数。 */
export const MAX_RULE_LIST_ITEMS = 200;

/** Rule Registry ID 允许的最大字符数。 */
export const MAX_RULE_ID_LENGTH = 160;

/** Revision 与 Version 引用允许的最大字符数。 */
export const MAX_RULE_REVISION_LENGTH = 200;

/** Scope 从通用到具体的确定性优先级。 */
export const RULE_SCOPE_SPECIFICITY: Readonly<Record<RuleScopeLevel, number>> = {
  [RuleScopeLevel.Harness]: 0,
  [RuleScopeLevel.Organization]: 1,
  [RuleScopeLevel.Workspace]: 2,
  [RuleScopeLevel.Repository]: 3,
  [RuleScopeLevel.Path]: 4,
  [RuleScopeLevel.Task]: 5,
};

/** Enforcement 从建议到硬阻断的确定性强度。 */
export const RULE_ENFORCEMENT_STRENGTH: Readonly<Record<RuleEnforcement, number>> = {
  [RuleEnforcement.Advisory]: 0,
  [RuleEnforcement.ApprovalRequired]: 1,
  [RuleEnforcement.Blocking]: 2,
};
