import type { CommandReceipt } from "#application/command/index.js";
import type { ApplicationCommandGateway } from "#application/commandGateway/index.js";
import type { HarnessError, Result } from "#common/index.js";

import type { RequirementWorkflowCommandHandler } from "../handler/index.js";

/** RequirementWorkflow 的版本化写入口，统一经过 Application Command Gateway。 */
export class WorkflowCommandService {
  public constructor(
    private readonly gateway: ApplicationCommandGateway,
    private readonly handler: RequirementWorkflowCommandHandler,
  ) {}

  /** 执行 Workflow Command 并返回可审计 Receipt。 */
  public execute(input: unknown): Promise<Result<CommandReceipt, HarnessError>> {
    return this.gateway.execute(input, this.handler);
  }
}
