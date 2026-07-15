import {
  TaskBackedCodingTaskAuthorizationPolicy,
  UnresolvedWorktreeProvisionGuard,
} from "#application/index.js";
import type {
  ActionJournalRepository,
  CodingTaskExecutionAuthorizationResolver,
  TaskRepository,
  VerificationExecutorPort,
} from "#application/ports/index.js";
import type { Clock } from "#common/index.js";
import {
  MockVerificationExecutorAdapter,
  NodeVerificationExecutorAdapter,
} from "#infrastructure/index.js";
import type { ContentDigestPort } from "#application/ports/index.js";
import type { CommandRunner } from "#infrastructure/system/commandRunner/index.js";
import { VerificationExecutionMode } from "../enums/index.js";

/** 解析 CodingTask 授权器的默认实现或调用方覆盖。 */
export function createCodingTaskAuthorizationResolver(
  override: CodingTaskExecutionAuthorizationResolver | undefined,
  taskRepository: TaskRepository,
  clock: Clock,
): CodingTaskExecutionAuthorizationResolver {
  return override ?? new TaskBackedCodingTaskAuthorizationPolicy(taskRepository, clock);
}

/** 创建未闭合 Worktree Provision 的 fail-closed 防护器。 */
export function createUnresolvedProvisionGuard(
  repository: ActionJournalRepository,
  digest: ContentDigestPort,
): UnresolvedWorktreeProvisionGuard {
  return new UnresolvedWorktreeProvisionGuard(repository, digest);
}

/** 创建默认 fail-closed 或本地命令 Verification Executor。 */
export function createVerificationExecutor(
  override: VerificationExecutorPort | undefined,
  mode: VerificationExecutionMode | undefined,
  commandRunner: CommandRunner,
  clock: Clock,
): VerificationExecutorPort {
  return (
    override ??
    (mode === VerificationExecutionMode.LocalCommand
      ? new NodeVerificationExecutorAdapter(commandRunner, clock)
      : new MockVerificationExecutorAdapter(clock))
  );
}
