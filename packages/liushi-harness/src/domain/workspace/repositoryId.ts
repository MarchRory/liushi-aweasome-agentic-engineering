import { HarnessError, HarnessErrorCode, failure, success, type Result } from "#common/index.js";

import { REPOSITORY_ID_PATTERN } from "./workspaceConstants.js";

declare const repositoryIdBrand: unique symbol;

/** 经过路径安全校验的 Repository 稳定 ID。 */
export type RepositoryId = string & { readonly [repositoryIdBrand]: true };

/** 将外部字符串校验并转换为 Repository ID。 */
export function parseRepositoryId(value: string): Result<RepositoryId, HarnessError> {
  if (!isRepositoryId(value)) {
    return failure(
      new HarnessError(
        HarnessErrorCode.InvalidInput,
        "Repository ID must be 1-128 characters using letters, digits, dot, underscore, or hyphen.",
        { field: "repositoryId" },
      ),
    );
  }

  return success(value as RepositoryId);
}

/** 判断字符串是否满足路径安全的 Repository ID 格式。 */
export function isRepositoryId(value: string): boolean {
  return REPOSITORY_ID_PATTERN.test(value);
}
