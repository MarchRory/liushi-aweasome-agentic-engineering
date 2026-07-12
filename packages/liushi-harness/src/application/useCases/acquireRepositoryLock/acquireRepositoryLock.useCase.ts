import type {
  AcquireRepositoryLockInput,
  RepositoryLockHandle,
  RepositoryLockPort,
  RepositoryLockRequest,
} from "#application/ports/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  type Result,
} from "#common/index.js";
import { parseRepositoryId, parseWorkspaceId } from "#domain/workspace/index.js";

import { MAX_REPOSITORY_LOCK_HOLDER_ID_LENGTH } from "./constants/index.js";

/** 校验输入后获取 Repository Lock，不执行任何 Repository 或 Worktree 写入。 */
export class AcquireRepositoryLockUseCase {
  public constructor(private readonly repositoryLock: RepositoryLockPort) {}

  /** 获取一个由调用方负责释放的 Repository Lock。 */
  public execute(
    input: AcquireRepositoryLockInput,
  ): Promise<Result<RepositoryLockHandle, HarnessError>> {
    const request = parseRequest(input);
    return request.status === ResultStatus.Failure
      ? Promise.resolve(request)
      : this.repositoryLock.acquire(request.value);
  }
}

function parseRequest(
  input: AcquireRepositoryLockInput,
): Result<RepositoryLockRequest, HarnessError> {
  const workspaceId = parseWorkspaceId(input.workspaceId);
  if (workspaceId.status === ResultStatus.Failure) return workspaceId;
  const repositoryId = parseRepositoryId(input.repositoryId);
  if (repositoryId.status === ResultStatus.Failure) return repositoryId;
  if (
    typeof input.holderId !== "string" ||
    input.holderId.length === 0 ||
    input.holderId.length > MAX_REPOSITORY_LOCK_HOLDER_ID_LENGTH ||
    !/^[A-Za-z0-9._-]+$/u.test(input.holderId)
  ) {
    return failure(
      new HarnessError(HarnessErrorCode.InvalidInput, "Repository Lock holderId is invalid.", {
        field: "holderId",
      }),
    );
  }
  return {
    status: ResultStatus.Success,
    value: {
      workspaceId: workspaceId.value,
      repositoryId: repositoryId.value,
      holderId: input.holderId,
    },
  };
}
