import type { CommandReceipt } from "#application/command/index.js";
import type { ApplicationCommandGateway } from "#application/commandGateway/index.js";
import { type HarnessError, type Result } from "#common/index.js";

import type { CodingTaskSessionCloseoutRecoveryCommandPayload } from "../command/index.js";
import type { CodingTaskSessionCloseoutRecoveryCommandHandler } from "../handler/index.js";

/** Closeout Recovery 写入口统一经由 Application Command Gateway。 */
export class CodingTaskSessionCloseoutRecoveryCommandService {
  public constructor(
    private readonly gateway: ApplicationCommandGateway,
    private readonly handler: CodingTaskSessionCloseoutRecoveryCommandHandler,
  ) {}

  public execute(input: unknown): Promise<Result<CommandReceipt, HarnessError>> {
    return this.gateway.execute<CodingTaskSessionCloseoutRecoveryCommandPayload>(
      input,
      this.handler,
    );
  }
}
