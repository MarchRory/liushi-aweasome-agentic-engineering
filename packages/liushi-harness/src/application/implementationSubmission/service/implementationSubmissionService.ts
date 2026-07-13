import type { CommandReceipt } from "#application/command/index.js";
import type { ApplicationCommandGateway } from "#application/commandGateway/index.js";
import { ResultStatus, type HarnessError, type Result } from "#common/index.js";

import type {
  ImplementationSubmissionRuntimeContext,
  SubmitImplementationCommandPayload,
} from "../contracts/index.js";
import type { ImplementationSubmissionHandler } from "../handler/index.js";

/** 实现 Checkpoint 与 Attempt 收口统一经过持久化 Application Command Gateway。 */
export class ImplementationSubmissionService {
  public constructor(
    private readonly gateway: ApplicationCommandGateway,
    private readonly handler: ImplementationSubmissionHandler,
  ) {}

  /** 在 Reservation 前校验 Runtime Binding，再执行版本化实现提交命令。 */
  public execute(
    input: unknown,
    runtime: ImplementationSubmissionRuntimeContext,
  ): Promise<Result<CommandReceipt, HarnessError>> {
    const validated = this.handler.validateRuntimeBinding(input, runtime);
    if (validated.status === ResultStatus.Failure) return Promise.resolve(validated);
    return this.gateway.execute<SubmitImplementationCommandPayload>(input, {
      execute: (command) => this.handler.execute(command, runtime),
    });
  }
}
