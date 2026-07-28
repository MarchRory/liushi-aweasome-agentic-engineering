import { z } from "zod";

import { CODING_TASK_AGGREGATE_TYPE } from "#application/codingTask/index.js";
import {
  COMMAND_ENVELOPE_SCHEMA_VERSION,
  parseCommandEnvelope,
  type CommandEnvelope,
} from "#application/command/index.js";
import {
  parseCodingTaskSessionDeliverySubmissionCommand,
  type CodingTaskSessionDeliverySubmissionCommandPayload,
} from "#application/codingTaskSessionDelivery/index.js";
import type { ContentDigestPort } from "#application/ports/index.js";
import {
  VERIFICATION_RUN_COMMAND_TYPE,
  validateVerificationRuntime,
  type VerificationCommandRuntimeContext,
} from "#application/verificationCommand/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import { parseActionId } from "#domain/actionJournal/index.js";
import { parseArtifactId } from "#domain/artifact/index.js";
import { parseProjectDiscoveryReport } from "#domain/projectDiscovery/index.js";
import { parseRuleResolutionContext } from "#domain/rule/index.js";
import { parseTaskId } from "#domain/task/index.js";
import { FailureTaxonomy } from "#domain/workflow/index.js";

import type { CodingTaskDeliveryCompletionInput } from "../contracts/index.js";

const identifier = z
  .string()
  .min(1)
  .max(128)
  .refine((value) => value === value.trim())
  .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value));

const profileCompilationSchema = z
  .object({
    taskId: z.string(),
    artifactId: z.string(),
    report: z.unknown(),
  })
  .strict();

const verificationSchema = z
  .object({
    commandId: z.unknown(),
    idempotencyKey: z.unknown(),
    actionId: z.string(),
    verificationRunId: identifier.regex(/^[A-Za-z0-9._-]+$/u),
    planId: identifier,
    actor: z.unknown(),
    authorizationContext: z.unknown(),
    invocationProvenance: z.unknown().optional(),
    submittedAt: z.unknown(),
    failedVerificationTaxonomy: z.enum([
      FailureTaxonomy.ImplementationDefect,
      FailureTaxonomy.RequirementOrSolutionGap,
    ]),
    runtime: z.unknown(),
  })
  .strict();

const inputSchema = z
  .object({
    deliveryCommand: z.unknown(),
    profileCompilation: profileCompilationSchema,
    ruleResolutionContext: z.unknown(),
    verification: verificationSchema,
  })
  .strict();

/** 在任何 Delivery 副作用前解析全部静态输入与命令元数据。 */
export function parseCodingTaskDeliveryCompletionInput(
  input: unknown,
  digest: ContentDigestPort,
): Result<CodingTaskDeliveryCompletionInput, HarnessError> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return invalid("Delivery Completion 输入结构无效。", parsed.error);
  const deliveryCommand = parseCodingTaskSessionDeliverySubmissionCommand(
    parsed.data.deliveryCommand,
    digest,
  );
  if (deliveryCommand.status === ResultStatus.Failure) return deliveryCommand;
  const taskId = parseTaskId(parsed.data.profileCompilation.taskId);
  if (taskId.status === ResultStatus.Failure) return taskId;
  const artifactId = parseArtifactId(parsed.data.profileCompilation.artifactId);
  if (artifactId.status === ResultStatus.Failure) return artifactId;
  const report = parseProjectDiscoveryReport(parsed.data.profileCompilation.report);
  if (report.status === ResultStatus.Failure) return report;
  if (report.value.workspaceId !== deliveryCommand.value.payload.workspaceId) {
    return forbidden("Project Discovery Report 与 Delivery Workspace 不匹配。");
  }
  const ruleContext = parseRuleResolutionContext(parsed.data.ruleResolutionContext);
  if (ruleContext.status === ResultStatus.Failure) return ruleContext;
  if (ruleContext.value.workspaceRef.workspaceId !== deliveryCommand.value.payload.workspaceId) {
    return forbidden("Rule Resolution Context 与 Delivery Workspace 不匹配。");
  }
  const actionId = parseActionId(parsed.data.verification.actionId);
  if (actionId.status === ResultStatus.Failure) return actionId;
  const runtime = validateVerificationRuntime(
    parsed.data.verification.runtime as VerificationCommandRuntimeContext,
  );
  if (runtime.status === ResultStatus.Failure) return runtime;
  const metadata = validateVerificationCommandMetadata(
    deliveryCommand.value,
    parsed.data.verification,
    digest,
  );
  if (metadata.status === ResultStatus.Failure) return metadata;

  return success({
    deliveryCommand: deliveryCommand.value,
    profileCompilation: {
      taskId: taskId.value,
      artifactId: artifactId.value,
      report: report.value,
    },
    ruleResolutionContext: ruleContext.value,
    verification: {
      commandId: metadata.value.commandId,
      idempotencyKey: metadata.value.idempotencyKey,
      actionId: actionId.value,
      verificationRunId: parsed.data.verification.verificationRunId,
      planId: parsed.data.verification.planId,
      actor: metadata.value.actor,
      authorizationContext: metadata.value.authorizationContext,
      ...(metadata.value.invocationProvenance === undefined
        ? {}
        : { invocationProvenance: metadata.value.invocationProvenance }),
      submittedAt: metadata.value.submittedAt,
      failedVerificationTaxonomy: parsed.data.verification.failedVerificationTaxonomy,
      runtime: runtime.value,
    },
  });
}

function validateVerificationCommandMetadata(
  deliveryCommand: CommandEnvelope<CodingTaskSessionDeliverySubmissionCommandPayload>,
  input: z.output<typeof verificationSchema>,
  digest: ContentDigestPort,
) {
  const placeholderDigest = digest.calculate({ command: "verification-metadata-validation" });
  if (placeholderDigest.status === ResultStatus.Failure) return placeholderDigest;
  return parseCommandEnvelope({
    schemaVersion: COMMAND_ENVELOPE_SCHEMA_VERSION,
    commandId: input.commandId,
    commandType: VERIFICATION_RUN_COMMAND_TYPE,
    aggregateType: CODING_TASK_AGGREGATE_TYPE,
    aggregateId: deliveryCommand.aggregateId,
    expectedVersion: deliveryCommand.expectedVersion,
    idempotencyKey: input.idempotencyKey,
    requestDigest: placeholderDigest.value,
    actor: input.actor,
    authorizationContext: input.authorizationContext,
    correlationId: deliveryCommand.correlationId,
    causationId: deliveryCommand.commandId,
    ...(input.invocationProvenance === undefined
      ? {}
      : { invocationProvenance: input.invocationProvenance }),
    submittedAt: input.submittedAt,
    payload: null,
  });
}

function invalid(message: string, cause?: unknown): Result<never, HarnessError> {
  return failure(new HarnessError(HarnessErrorCode.InvalidInput, message, {}, cause));
}

function forbidden(message: string): Result<never, HarnessError> {
  return failure(new HarnessError(HarnessErrorCode.OperationForbidden, message));
}
