import type { CommandEnvelope } from "#application/command/index.js";
import type { RunVerificationCommandPayload } from "#application/verificationCommand/index.js";
import type { VerificationPlan } from "#domain/verification/index.js";

import type { CodingTaskCellRevisionBinding } from "../enums/index.js";

/** 不包含提交后 Revision 的 Verification Plan 模板。 */
export type CodingTaskCellVerificationPlanTemplate = Omit<VerificationPlan, "targetRevision">;

/** Manifest 中只描述静态 Plan Template 的 Verification Payload。 */
export type CodingTaskCellVerificationTemplatePayload = Omit<
  RunVerificationCommandPayload,
  "plan"
> & {
  readonly plan: CodingTaskCellVerificationPlanTemplate;
};

/** Verification Revision 物化服务的输入。 */
export interface CodingTaskCellVerificationBindingInput {
  /** 已严格校验 Template Payload 摘要的命令信封。 */
  readonly command: CommandEnvelope<CodingTaskCellVerificationTemplatePayload>;
  /** 解析目标 Revision 的封闭策略。 */
  readonly binding: CodingTaskCellRevisionBinding;
}
