import type { CommandReceipt } from "#application/command/index.js";
import type { ApplicationCommandGateway } from "#application/commandGateway/index.js";
import { ResultStatus, type HarnessError, type Result } from "#common/index.js";

import type {
  ApplyImplementationCommandPayload,
  ImplementationCommandRuntimeContext,
} from "../contracts/index.js";
import type { ImplementationCommandHandler } from "../handler/index.js";

/** 所有受控文件写入统一经过持久化 Application Command Gateway。 */
export class ImplementationCommandService {
  public constructor(
    private readonly gateway: ApplicationCommandGateway,
    private readonly handler: ImplementationCommandHandler,
  ) {}

  /** 预校验 Runtime Binding 后执行版本化写入命令。 */
  public execute(
    input: unknown,
    runtime: ImplementationCommandRuntimeContext,
  ): Promise<Result<CommandReceipt, HarnessError>> {
    const validated = this.handler.validateRuntimeBinding(input, runtime);
    if (validated.status === ResultStatus.Failure) return Promise.resolve(validated);
    return this.gateway.execute<ApplyImplementationCommandPayload>(input, {
      execute: (command) => this.handler.execute(command, runtime),
    });
  }
}
