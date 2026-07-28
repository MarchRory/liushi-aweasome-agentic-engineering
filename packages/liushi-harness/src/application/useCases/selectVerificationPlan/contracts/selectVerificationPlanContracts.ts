import type { CodingTaskAggregate } from "#domain/codingTask/index.js";
import type { ProjectProfileBundle } from "#domain/projectProfile/index.js";
import type { ApplicableRuleBundle } from "#domain/rule/index.js";
import type {
  VerificationImpactSelection,
  VerificationImpactSelectionStatus,
  VerificationPlan,
  VerificationPlanSourceRefs,
} from "#domain/verification/index.js";

/** 生成 Verification Plan 所需的完整权威输入。 */
export interface SelectVerificationPlanInput {
  /** G8 已批准并编译的 Project Profile Bundle。 */
  profileBundle: ProjectProfileBundle;
  /** 当前单仓实现阶段的 CodingTask 真源。 */
  codingTask: CodingTaskAggregate;
  /** 当前实现尝试序号。 */
  attemptNumber: number;
  /** 对当前 Task 和显式 Target 解析出的 Rule Bundle。 */
  ruleBundle: ApplicableRuleBundle;
  /** 待生成 Verification Plan 的稳定 ID。 */
  planId: string;
}

/** 兼容既有 Application 命名的 Verification Plan 来源别名。 */
export type VerificationPlanSelectionSourceRefs = VerificationPlanSourceRefs;

/** Verification Plan 选择结果的公共字段。 */
interface VerificationPlanSelectionBase {
  /** 完整可解释的影响面选择结果。 */
  selection: VerificationImpactSelection;
  /** 选择所绑定的 Project Profile 与 Rule 来源。 */
  sourceRefs: VerificationPlanSelectionSourceRefs;
}

/** 全部不变量满足后生成的 Verification Plan。 */
export interface ReadyVerificationPlanSelection extends VerificationPlanSelectionBase {
  /** 当前结果可以进入 Verification Command。 */
  status: VerificationImpactSelectionStatus.Ready;
  /** 绑定当前实现 Revision 的确定性计划。 */
  plan: VerificationPlan;
}

/** 影响面或 Validator 映射不完整时的关闭式结果。 */
export interface BlockedVerificationPlanSelection extends VerificationPlanSelectionBase {
  /** 当前结果必须先由 Human 或上游配置修复。 */
  status: VerificationImpactSelectionStatus.Blocked;
}

/** Verification Plan 选择 Use Case 的判别联合结果。 */
export type VerificationPlanSelectionResult =
  ReadyVerificationPlanSelection | BlockedVerificationPlanSelection;
