import { z } from "zod";

import { ResultStatus, WORKFLOW_EVENT_SCHEMA_VERSION, actorRefSchema } from "#common/index.js";
import {
  WorkflowCellKind,
  WorkflowEventType,
  WorkflowKind,
  WorkflowRouteKind,
  WorkflowRunState,
  FailureTaxonomy,
  WorkflowControlAction,
  parseContextManifest,
  parseEffectiveRevisionSet,
  parseInputBindingSet,
  parseWorkflowEventId,
  parseWorkflowId,
  type WorkflowEvent,
} from "#domain/workflow/index.js";
import { parseWorkspaceId } from "#domain/workspace/index.js";

const nonBlank = (maxLength: number) =>
  z
    .string()
    .min(1)
    .max(maxLength)
    .refine((value) => value === value.trim())
    .refine((value) => !value.includes("\0"));

const workflowIdSchema = z.string().transform((value, context) => {
  const parsed = parseWorkflowId(value);
  if (parsed.status === ResultStatus.Failure) {
    context.addIssue({ code: "custom", message: parsed.error.message });
    return z.NEVER;
  }
  return parsed.value;
});

const workflowEventIdSchema = z.string().transform((value, context) => {
  const parsed = parseWorkflowEventId(value);
  if (parsed.status === ResultStatus.Failure) {
    context.addIssue({ code: "custom", message: parsed.error.message });
    return z.NEVER;
  }
  return parsed.value;
});

const workspaceIdSchema = z.string().transform((value, context) => {
  const parsed = parseWorkspaceId(value);
  if (parsed.status === ResultStatus.Failure) {
    context.addIssue({ code: "custom", message: parsed.error.message });
    return z.NEVER;
  }
  return parsed.value;
});

const revisionSetSchema = z.unknown().transform((value, context) => {
  const parsed = parseEffectiveRevisionSet(value);
  if (parsed.status === ResultStatus.Failure) {
    context.addIssue({ code: "custom", message: parsed.error.message });
    return z.NEVER;
  }
  return parsed.value;
});

const inputBindingSetSchema = z.unknown().transform((value, context) => {
  const parsed = parseInputBindingSet(value);
  if (parsed.status === ResultStatus.Failure) {
    context.addIssue({ code: "custom", message: parsed.error.message });
    return z.NEVER;
  }
  return parsed.value;
});

const contextManifestSchema = z.unknown().transform((value, context) => {
  const parsed = parseContextManifest(value);
  if (parsed.status === ResultStatus.Failure) {
    context.addIssue({ code: "custom", message: parsed.error.message });
    return z.NEVER;
  }
  return parsed.value;
});

const commonFields = {
  schemaVersion: z.literal(WORKFLOW_EVENT_SCHEMA_VERSION),
  eventId: workflowEventIdSchema,
  workflowId: workflowIdSchema,
  workspaceId: workspaceIdSchema,
  sequence: z.number().int().positive(),
  commandId: nonBlank(256),
  correlationId: nonBlank(256),
  causationId: nonBlank(256).optional(),
  occurredAt: z.string().datetime({ offset: true }),
  actor: actorRefSchema,
  previousHash: z.string().regex(/^[a-f0-9]{64}$/),
  hash: z.string().regex(/^[a-f0-9]{64}$/),
};

const eventSchema = z.discriminatedUnion("type", [
  z
    .object({
      ...commonFields,
      type: z.literal(WorkflowEventType.WorkflowCreated),
      payload: z
        .object({
          workflowKind: z.literal(WorkflowKind.Requirement),
          initialCell: z.literal(WorkflowCellKind.PrdIntake),
          initialState: z.literal(WorkflowRunState.Active),
          effectiveRevisionSet: revisionSetSchema,
          inputBindingSet: inputBindingSetSchema,
          contextManifest: contextManifestSchema,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...commonFields,
      type: z.literal(WorkflowEventType.CellRouted),
      payload: z
        .object({
          fromCell: z.enum(WorkflowCellKind),
          toCell: z.enum(WorkflowCellKind),
          routeKind: z.enum(WorkflowRouteKind),
          failureTaxonomy: z.enum(FailureTaxonomy).optional(),
          requiresHuman: z.boolean(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...commonFields,
      type: z.literal(WorkflowEventType.ControlApplied),
      payload: z
        .object({
          action: z.enum(WorkflowControlAction),
          fromState: z.enum(WorkflowRunState),
          toState: z.enum(WorkflowRunState),
          requiresHuman: z.literal(true),
        })
        .strict(),
    })
    .strict(),
]);

/** 解析并严格校验一条从 JSONL 读取的 Workflow Event。 */
export function parseWorkflowEvent(input: unknown): WorkflowEvent {
  return eventSchema.parse(input) as WorkflowEvent;
}
