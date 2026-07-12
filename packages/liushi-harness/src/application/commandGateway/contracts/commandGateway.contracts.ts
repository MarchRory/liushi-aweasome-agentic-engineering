import type { HarnessError, Result } from "#common/index.js";

import type { CommandEnvelope } from "../../command/index.js";

/** Command Handler 成功提交后的最小结果。 */
export interface CommandHandlerSuccess {
  /** Handler 提交后的 Aggregate Version。 */
  readonly committedVersion: number;
}

/** Gateway 调用的业务 Handler；每个 Reservation 最多调用一次。 */
export interface CommandHandler<TPayload = unknown> {
  /** 校验 Payload、执行授权后的业务动作并返回提交版本。 */
  execute(command: CommandEnvelope<TPayload>): Promise<Result<CommandHandlerSuccess, HarnessError>>;
}
