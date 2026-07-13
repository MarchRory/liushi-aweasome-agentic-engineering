import type { CommandReceipt } from "#application/command/index.js";
import type { ApplicationCommandGateway } from "#application/commandGateway/index.js";
import type { HarnessError, Result } from "#common/index.js";

import type { ReconcileWorktreeProvisionCommandPayload } from "../contracts/index.js";
import type { WorktreeProvisionRecoveryCommandHandler } from "../handler/index.js";

/** 统一经 Application Command Gateway 执行 Human Worktree Provision 恢复。 */
export class WorktreeProvisionRecoveryCommandService {
  public constructor(
    private readonly gateway: ApplicationCommandGateway,
    private readonly handler: WorktreeProvisionRecoveryCommandHandler,
  ) {}

  /** 执行版本化恢复命令并返回稳定 Command Receipt。 */
  public execute(input: unknown): Promise<Result<CommandReceipt, HarnessError>> {
    return this.gateway.execute<ReconcileWorktreeProvisionCommandPayload>(input, this.handler);
  }
}
