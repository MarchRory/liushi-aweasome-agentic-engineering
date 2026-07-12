import type { ActionJournalMutationOutput, ActionJournalRepository } from "../../ports/index.js";
import type { HarnessError, Result } from "#common/index.js";
import { ResultStatus } from "#common/index.js";
import { parseActionObservation } from "#domain/actionJournal/index.js";

/** 记录 Action Observation 的输入。 */
export interface RecordActionObservationInput {
  /** 尚未信任的 Action Observation Record。 */
  readonly record: unknown;
}

/** 严格校验并记录副作用执行或恢复检查结果。 */
export class RecordActionObservationUseCase {
  public constructor(private readonly repository: ActionJournalRepository) {}

  /** 校验并幂等提交 Action Observation。 */
  public execute(
    input: RecordActionObservationInput,
  ): Promise<Result<ActionJournalMutationOutput, HarnessError>> {
    const parsed = parseActionObservation(input.record);
    return parsed.status === ResultStatus.Failure
      ? Promise.resolve(parsed)
      : this.repository.appendObservation(parsed.value);
  }
}
