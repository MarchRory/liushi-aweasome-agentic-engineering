import type { CommandReceipt } from "#application/command/index.js";
import type { ApplicationCommandGateway } from "#application/commandGateway/index.js";
import type { HarnessError, Result } from "#common/index.js";
import type { CodingTaskCommandHandler } from "../handler/index.js";

/** CodingTask 的版本化写入服务，所有命令均经过 Gateway。 */
export class CodingTaskCommandService {
  public constructor(
    private readonly gateway: ApplicationCommandGateway,
    private readonly handler: CodingTaskCommandHandler,
  ) {}

  /** 通过 Application Command Gateway 执行 CodingTask Command。 */
  public execute(input: unknown): Promise<Result<CommandReceipt, HarnessError>> {
    return this.gateway.execute(input, this.handler);
  }
}
