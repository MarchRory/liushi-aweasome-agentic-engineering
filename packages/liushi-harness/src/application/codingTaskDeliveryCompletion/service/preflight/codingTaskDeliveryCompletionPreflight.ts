import type { CodingTaskSessionCloseoutState } from "#application/codingTaskSessionCloseoutState/index.js";
import type {
  CodingTaskSessionCloseoutStateStore,
  ManagedWorktreePathPort,
  RepositoryRootResolverPort,
} from "#application/ports/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import type { CodingTaskAggregate } from "#domain/codingTask/index.js";

import type { CodingTaskDeliveryCompletionInput } from "../../contracts/index.js";
import { CodingTaskDeliveryCompletionStage } from "../../enums/index.js";
import { validateCodingTaskDeliveryCompletionAuthority } from "../../validation/index.js";

/** Completion 在 Command Gateway 前执行权威预检所需的只读依赖。 */
export interface CodingTaskDeliveryCompletionPreflightDependencies {
  /** 读取当前 Session 的权威 Closeout State。 */
  readonly closeoutStateReader: Pick<
    CodingTaskSessionCloseoutStateStore<CodingTaskSessionCloseoutState>,
    "load"
  >;
  /** 解析启动期可信 Repository Root。 */
  readonly repositoryRootResolver: RepositoryRootResolverPort;
  /** 隔离不同操作系统的受管 Worktree 路径身份语义。 */
  readonly managedWorktreePath: ManagedWorktreePathPort;
}

/** 在任何 Delivery Reservation 前复验 Session 权威身份与受管 Worktree。 */
export async function validateCodingTaskDeliveryCompletionPreflight(
  aggregate: CodingTaskAggregate,
  input: CodingTaskDeliveryCompletionInput,
  dependencies: CodingTaskDeliveryCompletionPreflightDependencies,
): Promise<Result<void, HarnessError>> {
  const authority = await validateAuthority(aggregate, input, dependencies);
  if (authority.status === ResultStatus.Failure) return authority;
  return validateRuntimeBinding(aggregate, input, dependencies);
}

async function validateAuthority(
  aggregate: CodingTaskAggregate,
  input: CodingTaskDeliveryCompletionInput,
  dependencies: CodingTaskDeliveryCompletionPreflightDependencies,
): Promise<Result<void, HarnessError>> {
  let closeout: Result<CodingTaskSessionCloseoutState, HarnessError>;
  try {
    closeout = await dependencies.closeoutStateReader.load({
      workspaceId: input.deliveryCommand.payload.workspaceId,
      sessionId: input.deliveryCommand.payload.sessionId,
    });
  } catch (error) {
    return failure(
      runtimeError(
        new HarnessError(
          HarnessErrorCode.IoFailure,
          "Completion 权威 Closeout State 加载抛出异常。",
          {},
          error,
        ),
      ),
    );
  }
  if (closeout.status === ResultStatus.Failure) {
    return failure(runtimeError(closeout.error));
  }
  const authority = validateCodingTaskDeliveryCompletionAuthority(
    input.deliveryCommand,
    input.verification.actor,
    closeout.value,
    aggregate,
  );
  return authority.status === ResultStatus.Failure
    ? failure(runtimeError(authority.error))
    : authority;
}

async function validateRuntimeBinding(
  aggregate: CodingTaskAggregate,
  input: CodingTaskDeliveryCompletionInput,
  dependencies: CodingTaskDeliveryCompletionPreflightDependencies,
): Promise<Result<void, HarnessError>> {
  if (!aggregate.worktreeBinding.managed) {
    return failure(runtimeForbidden("CodingTask Delivery 只允许受管 Worktree。"));
  }
  const repositoryRoot = await dependencies.repositoryRootResolver.resolve({
    workspaceId: aggregate.workspaceId,
    repositoryId: aggregate.repositoryId,
  });
  if (repositoryRoot.status === ResultStatus.Failure) {
    return failure(runtimeError(repositoryRoot.error));
  }
  const expectedRoot = dependencies.managedWorktreePath.resolveManagedWorktreeRoot({
    repositoryRoot: repositoryRoot.value.repositoryRoot,
    worktreeRelativePath: aggregate.worktreeBinding.relativePath,
  });
  if (expectedRoot.status === ResultStatus.Failure) {
    return failure(runtimeError(expectedRoot.error));
  }
  return dependencies.managedWorktreePath.hasSamePathIdentity(
    expectedRoot.value,
    input.verification.runtime.worktreeRoot,
  )
    ? success(undefined)
    : failure(runtimeForbidden("Verification Runtime 与权威受管 Worktree 不匹配。"));
}

function runtimeError(error: HarnessError): HarnessError {
  return new HarnessError(
    error.code,
    error.message,
    { ...error.details, stage: CodingTaskDeliveryCompletionStage.RuntimeBinding },
    error.cause,
  );
}

function runtimeForbidden(message: string): HarnessError {
  return runtimeError(new HarnessError(HarnessErrorCode.OperationForbidden, message));
}
