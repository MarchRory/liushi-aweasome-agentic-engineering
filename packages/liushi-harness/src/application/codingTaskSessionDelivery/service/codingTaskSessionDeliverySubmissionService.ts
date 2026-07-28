import type { CommandReceipt } from "#application/command/index.js";
import type { ApplicationCommandGateway } from "#application/commandGateway/index.js";
import type { HarnessError, Result } from "#common/index.js";

import type { CodingTaskSessionDeliverySubmissionCommandPayload } from "../command/index.js";
import type { CodingTaskSessionDeliverySubmissionHandler } from "../handler/index.js";

/** Session Delivery Submission 写入口统一经过 Application Command Gateway。 */
export class CodingTaskSessionDeliverySubmissionService {
  public constructor(
    private readonly gateway: ApplicationCommandGateway,
    private readonly handler: CodingTaskSessionDeliverySubmissionHandler,
  ) {}

  /** 持久化幂等 Reservation 后执行 Effective Closeout Handoff。 */
  public execute(input: unknown): Promise<Result<CommandReceipt, HarnessError>> {
    return this.gateway.execute<CodingTaskSessionDeliverySubmissionCommandPayload>(
      input,
      this.handler,
    );
  }
}
