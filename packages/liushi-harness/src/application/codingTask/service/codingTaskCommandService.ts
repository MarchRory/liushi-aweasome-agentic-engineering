import { parseCommandEnvelope, type CommandReceipt } from "#application/command/index.js";
import type {
  ApplicationCommandGateway,
  CommandHandlerSuccess,
} from "#application/commandGateway/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  type Result,
} from "#common/index.js";
import { CodingTaskCommandType } from "../commands/index.js";
import type { CodingTaskCommandHandler } from "../handler/index.js";

/** CodingTask 的版本化写入服务，所有命令均经过 Gateway。 */
export class CodingTaskCommandService {
  public constructor(
    private readonly gateway: ApplicationCommandGateway,
    private readonly handler: CodingTaskCommandHandler,
  ) {}

  /** 通过 Application Command Gateway 执行 CodingTask Command。 */
  public execute(input: unknown): Promise<Result<CommandReceipt, HarnessError>> {
    const parsed = parseCommandEnvelope(input);
    if (parsed.status === ResultStatus.Failure) return Promise.resolve(parsed);
    if (parsed.value.commandType === String(CodingTaskCommandType.SubmitImplementation)) {
      return this.gateway.execute(input, publicImplementationSubmissionRejectionHandler);
    }
    return this.gateway.execute(input, this.handler);
  }
}

const publicImplementationSubmissionRejectionHandler = {
  execute(): Promise<Result<CommandHandlerSuccess, HarnessError>> {
    return Promise.resolve(
      failure(
        new HarnessError(
          HarnessErrorCode.OperationForbidden,
          "SubmitImplementation 只能通过内部实现提交入口执行。",
        ),
      ),
    );
  },
};
