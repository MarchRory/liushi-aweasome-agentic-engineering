import { HarnessError, HarnessErrorCode, failure, success, type Result } from "#common/index.js";

const WORKFLOW_IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const WORKFLOW_EVENT_ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

declare const workflowIdBrand: unique symbol;
declare const workflowEventIdBrand: unique symbol;

/** 经过路径安全校验的 Workflow 稳定 ID。 */
export type WorkflowId = string & { readonly [workflowIdBrand]: true };

/** 经过 ULID 校验的 Workflow Event ID。 */
export type WorkflowEventId = string & { readonly [workflowEventIdBrand]: true };

/** 将外部字符串校验并转换为 Workflow ID。 */
export function parseWorkflowId(value: string): Result<WorkflowId, HarnessError> {
  if (!WORKFLOW_IDENTIFIER_PATTERN.test(value)) {
    return failure(
      new HarnessError(HarnessErrorCode.InvalidInput, "Workflow ID 格式无效。", {
        field: "workflowId",
      }),
    );
  }
  return success(value as WorkflowId);
}

/** 将 Event ID 生成器的结果校验为 Workflow Event ID。 */
export function parseWorkflowEventId(value: string): Result<WorkflowEventId, HarnessError> {
  if (!WORKFLOW_EVENT_ULID_PATTERN.test(value)) {
    return failure(
      new HarnessError(HarnessErrorCode.InvalidInput, "Workflow Event ID 必须是大写 ULID。", {
        field: "eventId",
      }),
    );
  }
  return success(value as WorkflowEventId);
}
