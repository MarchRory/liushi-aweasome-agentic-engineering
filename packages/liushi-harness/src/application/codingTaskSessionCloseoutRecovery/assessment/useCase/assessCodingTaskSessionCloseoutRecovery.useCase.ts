import { ResultStatus, type HarnessError, type Result } from "#common/index.js";

import type { CodingTaskSessionCloseoutRecoveryAssessment } from "../../contracts/index.js";
import type { CodingTaskSessionCloseoutRecoveryAssessmentService } from "../service/index.js";

/** 向公开调用方提供严格输入与脱敏投影的 Closeout Recovery Assessment Use Case。 */
export class AssessCodingTaskSessionCloseoutRecoveryUseCase {
  public constructor(
    private readonly service: CodingTaskSessionCloseoutRecoveryAssessmentService,
  ) {}

  /** 严格解析 unknown，并只返回不含绝对路径的公开 Assessment。 */
  public async execute(
    input: unknown,
  ): Promise<Result<CodingTaskSessionCloseoutRecoveryAssessment, HarnessError>> {
    const assessed = await this.service.assess(input);
    return assessed.status === ResultStatus.Failure
      ? assessed
      : { status: ResultStatus.Success, value: assessed.value.assessment };
  }
}
