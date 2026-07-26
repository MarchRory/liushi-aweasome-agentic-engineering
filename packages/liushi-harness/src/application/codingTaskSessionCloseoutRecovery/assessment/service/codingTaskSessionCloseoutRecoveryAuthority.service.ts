import {
  hasSameCodingTaskSessionCloseoutCommandIdentity,
  validateCodingTaskSessionCloseoutAuthority,
  type CodingTaskSessionCloseoutAuthority,
  type CodingTaskSessionCloseoutCommand,
} from "#application/codingTaskSessionCloseout/index.js";
import type { CodingTaskSessionCloseoutState } from "#application/codingTaskSessionCloseoutState/index.js";
import type { CodingTaskSessionCloseoutStateLocator } from "#application/ports/codingTaskSessionCloseoutStateStore/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  type Result,
} from "#common/index.js";

import type { CodingTaskSessionCloseoutRecoveryAssessmentServiceDependencies } from "../contracts/index.js";
import { createAssessmentInvocationError } from "../validation/index.js";

/** 只读加载并验证 Closeout Recovery 所需的全部权威身份。 */
export async function loadCodingTaskSessionCloseoutRecoveryAuthority(
  dependencies: CodingTaskSessionCloseoutRecoveryAssessmentServiceDependencies,
  command: CodingTaskSessionCloseoutCommand,
  locator: CodingTaskSessionCloseoutStateLocator,
): Promise<Result<CodingTaskSessionCloseoutAuthority, HarnessError>> {
  const activation = await invoke(
    () => dependencies.activationRepository.load(locator),
    "Session Activation 加载失败。",
  );
  if (activation.status === ResultStatus.Failure) return activation;
  const codingTask = await invoke(
    () =>
      dependencies.codingTaskRepository.load({
        workspaceId: activation.value.workspaceId,
        codingTaskId: activation.value.codingTaskId,
      }),
    "CodingTask Aggregate 加载失败。",
  );
  if (codingTask.status === ResultStatus.Failure) return codingTask;
  const binding = await invoke(
    () =>
      dependencies.bindingStore.findSession({
        workspaceId: activation.value.workspaceId,
        sessionId: activation.value.sessionId,
      }),
    "Session Hook Binding 加载失败。",
  );
  if (binding.status === ResultStatus.Failure) return binding;
  const repositoryRoot = await invoke(
    () =>
      dependencies.repositoryRootResolver.resolve({
        workspaceId: activation.value.workspaceId,
        repositoryId: activation.value.repositoryId,
      }),
    "可信 Repository Root 解析失败。",
  );
  if (repositoryRoot.status === ResultStatus.Failure) return repositoryRoot;
  const worktreeRoot = invokeSync(
    () =>
      dependencies.managedWorktreePath.resolveManagedWorktreeRoot({
        repositoryRoot: repositoryRoot.value.repositoryRoot,
        worktreeRelativePath: codingTask.value.aggregate.worktreeBinding.relativePath,
      }),
    "Managed Worktree Root 解析失败。",
  );
  if (worktreeRoot.status === ResultStatus.Failure) return worktreeRoot;
  try {
    return validateCodingTaskSessionCloseoutAuthority({
      command,
      activation: activation.value,
      codingTask: codingTask.value,
      binding: binding.value,
      repositoryRoot: repositoryRoot.value.repositoryRoot,
      worktreeRoot: worktreeRoot.value,
      digest: dependencies.digest,
    });
  } catch (error) {
    return failure(createAssessmentInvocationError("Closeout Authority 复验抛出异常。", error));
  }
}

/** 比较 State 与重建 Command 的不可变身份，并确认首次创建时间未漂移。 */
export function hasStableCloseoutRecoveryIdentity(
  state: CodingTaskSessionCloseoutState,
  command: CodingTaskSessionCloseoutCommand,
  authority: CodingTaskSessionCloseoutAuthority,
): boolean {
  return (
    hasSameCodingTaskSessionCloseoutCommandIdentity(state, command, authority) &&
    state.createdAt === command.submittedAt
  );
}

async function invoke<T>(
  operation: () => Promise<Result<T, HarnessError>>,
  message: string,
): Promise<Result<T, HarnessError>> {
  try {
    return await operation();
  } catch (error) {
    return failure(new HarnessError(HarnessErrorCode.IoFailure, message, {}, error));
  }
}

function invokeSync<T>(
  operation: () => Result<T, HarnessError>,
  message: string,
): Result<T, HarnessError> {
  try {
    return operation();
  } catch (error) {
    return failure(new HarnessError(HarnessErrorCode.IoFailure, message, {}, error));
  }
}
