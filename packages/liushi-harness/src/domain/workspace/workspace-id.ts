import { HarnessError, HarnessErrorCode } from "../../common/errors/harness-error.js";
import { failure, success, type Result } from "../../common/result/result.js";

declare const workspaceIdBrand: unique symbol;

const WORKSPACE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

/** 经过路径安全校验的 Workspace ID。 */
export type WorkspaceId = string & { readonly [workspaceIdBrand]: true };

/** 将外部字符串校验并转换为 Workspace ID。 */
export function parseWorkspaceId(value: string): Result<WorkspaceId, HarnessError> {
  if (!WORKSPACE_ID_PATTERN.test(value)) {
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
