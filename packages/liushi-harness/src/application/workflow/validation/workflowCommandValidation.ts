import { z } from "zod";

import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import {
  FailureTaxonomy,
  WorkflowCellKind,
  WorkflowControlAction,
  WorkflowKind,
  parseContextManifest,
  parseEffectiveRevisionSet,
  parseInputBindingSet,
} from "#domain/workflow/index.js";

import {
  MAX_WORKFLOW_COMMAND_FIELD_LENGTH,
  MAX_WORKFLOW_WORKSPACE_ID_LENGTH,
} from "../constants/index.js";
import type {
  ControlWorkflowPayload,
  CreateRequirementWorkflowPayload,
  RouteWorkflowCellPayload,
} from "../commands/index.js";

const nonBlank = (maxLength: number) =>
  z
    .string()
    .min(1)
    .max(maxLength)
    .refine((value) => value === value.trim())
    .refine((value) => !value.includes("\0"));

const createPayloadSchema = z
  .object({
    workspaceId: nonBlank(MAX_WORKFLOW_WORKSPACE_ID_LENGTH),
    workflowKind: z.literal(WorkflowKind.Requirement),
    effectiveRevisionSet: z.unknown(),
    inputBindingSet: z.unknown(),
    contextManifest: z.unknown(),
  })
  .strict();

const routePayloadSchema = z
  .object({
    workspaceId: nonBlank(MAX_WORKFLOW_WORKSPACE_ID_LENGTH),
    targetCell: z.enum(WorkflowCellKind),
    failureTaxonomy: z.enum(FailureTaxonomy).optional(),
  })
  .strict();

const controlPayloadSchema = z
  .object({
    workspaceId: nonBlank(MAX_WORKFLOW_WORKSPACE_ID_LENGTH),
    action: z.enum(WorkflowControlAction),
  })
  .strict();

/** 解析创建 Workflow 的 Payload，并校验三类上下文绑定。 */
export function parseCreateWorkflowPayload(
  input: unknown,
): Result<CreateRequirementWorkflowPayload, HarnessError> {
  const parsed = createPayloadSchema.safeParse(input);
  if (!parsed.success) return failure(schemaError(parsed.error, "Workflow 创建 Payload 无效。"));
  const revisions = parseEffectiveRevisionSet(parsed.data.effectiveRevisionSet);
  if (revisions.status === ResultStatus.Failure) return revisions;
  const bindings = parseInputBindingSet(parsed.data.inputBindingSet);
  if (bindings.status === ResultStatus.Failure) return bindings;
  const context = parseContextManifest(parsed.data.contextManifest);
  if (context.status === ResultStatus.Failure) return context;
  return success({
    workspaceId: parsed.data.workspaceId,
    workflowKind: parsed.data.workflowKind,
    effectiveRevisionSet: revisions.value,
    inputBindingSet: bindings.value,
    contextManifest: context.value,
  });
}

/** 解析 Cell 路由 Payload，保留 Failure Taxonomy 的封闭枚举。 */
export function parseRouteWorkflowCellPayload(
  input: unknown,
): Result<RouteWorkflowCellPayload, HarnessError> {
  const parsed = routePayloadSchema.safeParse(input);
  return parsed.success
    ? success({
        workspaceId: parsed.data.workspaceId,
        targetCell: parsed.data.targetCell,
        ...(parsed.data.failureTaxonomy === undefined
          ? {}
          : { failureTaxonomy: parsed.data.failureTaxonomy }),
      })
    : failure(schemaError(parsed.error, "Workflow Cell 路由 Payload 无效。"));
}

/** 解析 Human 控制 Payload。 */
export function parseControlWorkflowPayload(
  input: unknown,
): Result<ControlWorkflowPayload, HarnessError> {
  const parsed = controlPayloadSchema.safeParse(input);
  return parsed.success
    ? success(parsed.data)
    : failure(schemaError(parsed.error, "Workflow Human 控制 Payload 无效。"));
}

function schemaError(error: z.ZodError, message: string): HarnessError {
  const issue = error.issues[0];
  return new HarnessError(
    HarnessErrorCode.InvalidInput,
    message,
    {
      path: issue?.path.join(".") ?? "unknown",
      issue: issue?.message ?? "unknown",
      fieldLimit: String(MAX_WORKFLOW_COMMAND_FIELD_LENGTH),
    },
    error,
  );
}
