import type { ActionJournalMutationOutput, ActionJournalRepository } from "../../ports/index.js";
import type { HarnessError, Result } from "#common/index.js";
import { ResultStatus } from "#common/index.js";
import { parseActionIntent } from "#domain/actionJournal/index.js";

/** 记录 Action Intent 的输入。 */
export interface RecordActionIntentInput {
  /** 尚未信任的 Action Intent Record。 */
  readonly record: unknown;
}

/** 在副作用执行前严格校验并持久化 Action Intent。 */
export class RecordActionIntentUseCase {
  public constructor(private readonly repository: ActionJournalRepository) {}

  /** 校验并幂等提交 Action Intent。 */
  public execute(
    input: RecordActionIntentInput,
  ): Promise<Result<ActionJournalMutationOutput, HarnessError>> {
    const parsed = parseActionIntent(input.record);
    return parsed.status === ResultStatus.Failure
      ? Promise.resolve(parsed)
      : this.repository.createIntent(parsed.value);
  }
}
