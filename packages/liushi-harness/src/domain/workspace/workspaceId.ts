import { HarnessError, HarnessErrorCode, failure, success, type Result } from "#common/index.js";

import { WORKSPACE_ID_PATTERN } from "./workspaceConstants.js";

declare const workspaceIdBrand: unique symbol;

/** 经过路径安全校验的 Workspace ID。 */
export type WorkspaceId = string & { readonly [workspaceIdBrand]: true };

/** 将外部字符串校验并转换为 Workspace ID。 */
export function parseWorkspaceId(value: string): Result<WorkspaceId, HarnessError> {
  if (!isWorkspaceId(value)) {
    return failure(
      new HarnessError(
        HarnessErrorCode.InvalidInput,
        "Workspace ID must be 1-64 characters using letters, digits, underscore, or hyphen.",
        { field: "workspaceId" },
      ),
    );
  }

  return success(value as WorkspaceId);
}

/** 判断字符串是否满足路径安全的 Workspace ID 格式。 */
export function isWorkspaceId(value: string): boolean {
  return WORKSPACE_ID_PATTERN.test(value);
}
