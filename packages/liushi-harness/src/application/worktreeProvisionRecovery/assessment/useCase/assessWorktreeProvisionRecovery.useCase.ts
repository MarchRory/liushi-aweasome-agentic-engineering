import type { HarnessError, Result } from "#common/index.js";

import type {
  AssessWorktreeProvisionRecoveryInput,
  WorktreeProvisionRecoveryAssessment,
} from "../../contracts/index.js";
import { parseWorktreeProvisionRecoveryLocator } from "../../validation/index.js";
import type { WorktreeProvisionRecoveryAssessmentService } from "../service/index.js";
import { ResultStatus } from "#common/index.js";

/** 向 Human 提供脱敏且可绑定摘要的 Worktree Provision 恢复评估。 */
export class AssessWorktreeProvisionRecoveryUseCase {
  public constructor(private readonly service: WorktreeProvisionRecoveryAssessmentService) {}

  /** 执行只读现场评估。 */
  public async execute(
    input: AssessWorktreeProvisionRecoveryInput,
  ): Promise<Result<WorktreeProvisionRecoveryAssessment, HarnessError>> {
    const locator = parseWorktreeProvisionRecoveryLocator(input);
    if (locator.status === ResultStatus.Failure) return locator;
    const assessed = await this.service.assess(locator.value);
    return assessed.status === ResultStatus.Failure
      ? assessed
      : { status: ResultStatus.Success, value: assessed.value.assessment };
  }
}
