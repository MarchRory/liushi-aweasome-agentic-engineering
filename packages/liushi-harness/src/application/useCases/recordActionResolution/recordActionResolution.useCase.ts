import type { ActionJournalMutationOutput, ActionJournalRepository } from "../../ports/index.js";
import type { HarnessError, Result } from "#common/index.js";
import { ResultStatus } from "#common/index.js";
import { parseActionResolution } from "#domain/actionJournal/index.js";

/** 记录 Action Resolution 的输入。 */
export interface RecordActionResolutionInput {
  /** 尚未信任的 Action Resolution Record。 */
  readonly record: unknown;
}

/** 根据最新 Observation 严格校验并持久化 Action Resolution。 */
export class RecordActionResolutionUseCase {
  public constructor(private readonly repository: ActionJournalRepository) {}

  /** 校验并幂等提交 Action Resolution。 */
  public execute(
    input: RecordActionResolutionInput,
  ): Promise<Result<ActionJournalMutationOutput, HarnessError>> {
    const parsed = parseActionResolution(input.record);
    return parsed.status === ResultStatus.Failure
      ? Promise.resolve(parsed)
      : this.repository.appendResolution(parsed.value);
  }
}
