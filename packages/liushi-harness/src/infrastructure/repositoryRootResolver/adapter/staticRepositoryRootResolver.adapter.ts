import { isAbsolute, resolve } from "node:path";

import {
  RepositoryRootResolutionFailureCode,
  type RepositoryRootBinding,
  type RepositoryRootResolverPort,
  type ResolveRepositoryRootInput,
  type ResolvedRepositoryRoot,
} from "#application/ports/repositoryRootResolver/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import { parseRepositoryId, parseWorkspaceId } from "#domain/workspace/index.js";

/** 从启动期可信静态配置精确解析 Repository Root。 */
export class StaticRepositoryRootResolverAdapter implements RepositoryRootResolverPort {
  private readonly roots = new Map<string, string>();

  public constructor(bindings: readonly RepositoryRootBinding[] = []) {
    for (const binding of bindings) {
      const key = bindingKey(binding, RepositoryRootResolutionFailureCode.InvalidBinding);
      const repositoryRoot = canonicalizeRoot(binding);
      const existing = this.roots.get(key);
      if (existing !== undefined && existing !== repositoryRoot) {
        throw configurationError(
          RepositoryRootResolutionFailureCode.ConflictingBinding,
          "同一 Workspace 与 Repository 不能绑定到不同 Repository Root。",
          binding,
        );
      }
      this.roots.set(key, repositoryRoot);
    }
  }

  /** 仅返回与 Workspace、Repository 完全匹配的启动期可信绑定。 */
  public resolve(
    input: ResolveRepositoryRootInput,
  ): Promise<Result<ResolvedRepositoryRoot, HarnessError>> {
    let key: string;
    try {
      key = bindingKey(input, RepositoryRootResolutionFailureCode.InvalidRequest);
    } catch (error) {
      return Promise.resolve(failure(asHarnessError(error)));
    }

    const repositoryRoot = this.roots.get(key);
    if (repositoryRoot === undefined) {
      return Promise.resolve(
        failure(
          new HarnessError(
            HarnessErrorCode.OperationForbidden,
            "未配置与 Workspace、Repository 完全匹配的可信 Repository Root。",
            {
              failureCode: RepositoryRootResolutionFailureCode.BindingNotFound,
              workspaceId: input.workspaceId,
              repositoryId: input.repositoryId,
            },
          ),
        ),
      );
    }
    return Promise.resolve(success({ repositoryRoot }));
  }
}

function bindingKey(
  input: ResolveRepositoryRootInput,
  failureCode: RepositoryRootResolutionFailureCode,
): string {
  const workspaceId = parseWorkspaceId(input.workspaceId);
  const repositoryId = parseRepositoryId(input.repositoryId);
  if (workspaceId.status === ResultStatus.Failure || repositoryId.status === ResultStatus.Failure) {
    throw configurationError(failureCode, "Repository Root 绑定身份无效。", input);
  }
  return JSON.stringify([workspaceId.value, repositoryId.value]);
}

function canonicalizeRoot(binding: RepositoryRootBinding): string {
  const { repositoryRoot } = binding;
  if (
    repositoryRoot.length === 0 ||
    repositoryRoot.trim() !== repositoryRoot ||
    /[\u0000-\u001f\u007f]/u.test(repositoryRoot) ||
    !isAbsolute(repositoryRoot)
  ) {
    throw configurationError(
      RepositoryRootResolutionFailureCode.InvalidBinding,
      "Repository Root 必须是非空、无控制字符的绝对路径。",
      binding,
    );
  }
  return resolve(repositoryRoot);
}

function configurationError(
  failureCode: RepositoryRootResolutionFailureCode,
  message: string,
  input: ResolveRepositoryRootInput & { readonly repositoryRoot?: string },
): HarnessError {
  return new HarnessError(HarnessErrorCode.InvalidInput, message, {
    failureCode,
    workspaceId: input.workspaceId,
    repositoryId: input.repositoryId,
  });
}

function asHarnessError(error: unknown): HarnessError {
  return error instanceof HarnessError
    ? error
    : new HarnessError(HarnessErrorCode.InvalidInput, "Repository Root 解析请求无效。", {
        failureCode: RepositoryRootResolutionFailureCode.InvalidRequest,
      });
}
