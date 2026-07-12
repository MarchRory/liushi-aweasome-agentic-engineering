import type { CommandReceipt } from "#application/command/index.js";
import type { ApplicationCommandGateway } from "#application/commandGateway/index.js";
import { ResultStatus, type HarnessError, type Result } from "#common/index.js";

import type {
  RunVerificationCommandPayload,
  VerificationCommandRuntimeContext,
} from "../contracts/index.js";
import type { VerificationCommandHandler } from "../handler/index.js";

/** Verification 写入口统一经过 Application Command Gateway。 */
export class VerificationCommandService {
  public constructor(
    private readonly gateway: ApplicationCommandGateway,
    private readonly handler: VerificationCommandHandler,
  ) {}

  /** 在 Reservation 前校验 Runtime Binding，再执行版本化 Command。 */
  public execute(
    input: unknown,
    runtime: VerificationCommandRuntimeContext,
  ): Promise<Result<CommandReceipt, HarnessError>> {
    const validated = this.handler.validateRuntimeBinding(input, runtime);
    if (validated.status === ResultStatus.Failure) return Promise.resolve(validated);
    return this.gateway.execute<RunVerificationCommandPayload>(input, {
      execute: (command) => this.handler.execute(command, runtime),
    });
  }
}
