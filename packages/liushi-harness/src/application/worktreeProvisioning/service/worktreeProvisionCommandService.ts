import type { CommandReceipt } from "#application/command/index.js";
import type { ApplicationCommandGateway } from "#application/commandGateway/index.js";
import { ResultStatus, type HarnessError, type Result } from "#common/index.js";

import type {
  ProvisionWorktreeCommandPayload,
  ProvisionWorktreeRuntimeContext,
} from "../contracts/index.js";
import type { WorktreeProvisionCommandHandler } from "../handler/index.js";

/** 所有 Worktree Provision 命令统一经过 Application Command Gateway。 */
export class WorktreeProvisionCommandService {
  public constructor(
    private readonly gateway: ApplicationCommandGateway,
    private readonly handler: WorktreeProvisionCommandHandler,
  ) {}

  /** 校验 Runtime Binding 后执行版本化 Worktree Provision Command。 */
  public execute(
    input: unknown,
    runtime: ProvisionWorktreeRuntimeContext,
  ): Promise<Result<CommandReceipt, HarnessError>> {
    const validated = this.handler.validateRuntimeBinding(input, runtime);
    if (validated.status === ResultStatus.Failure) return Promise.resolve(validated);
    return this.gateway.execute<ProvisionWorktreeCommandPayload>(input, {
      execute: (command) => this.handler.execute(command, runtime),
    });
  }
}
