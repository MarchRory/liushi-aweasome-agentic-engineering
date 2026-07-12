import { z } from "zod";

import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  actorRefSchema,
  failure,
  parseContentDigest,
  success,
  type Result,
} from "#common/index.js";

import {
  COMMAND_ENVELOPE_SCHEMA_VERSION,
  COMMAND_RECEIPT_SCHEMA_VERSION,
  MAX_AGGREGATE_ID_LENGTH,
  MAX_AGGREGATE_TYPE_LENGTH,
  MAX_AUTHORIZATION_CONTEXT_KEYS,
  MAX_COMMAND_IDEMPOTENCY_KEY_LENGTH,
  MAX_COMMAND_ID_LENGTH,
  MAX_COMMAND_TRACE_ID_LENGTH,
  MAX_COMMAND_TYPE_LENGTH,
} from "./commandConstants.js";
import { CommandErrorCode, CommandStatus } from "./commandEnums.js";
import type {
  CommandEnvelope,
  CommandEnvelopeInput,
  CommandReceipt,
  CommandReceiptInput,
} from "./commandContracts.js";

const nonBlank = (maxLength: number): z.ZodString =>
  z
    .string()
    .min(1)
    .max(maxLength)
    .refine((value) => value === value.trim())
    .refine((value) => !value.includes("\0"));

const contentDigestSchema = z.string().transform((value, context) => {
  const parsed = parseContentDigest(value);
  if (parsed.status === ResultStatus.Failure) {
    context.addIssue({ code: "custom", message: parsed.error.message });
    return z.NEVER;
  }
  return parsed.value;
});

const authorizationContextSchema = z
  .record(z.string(), z.json())
  .refine((value) => Object.keys(value).length <= MAX_AUTHORIZATION_CONTEXT_KEYS);

const commandEnvelopeSchema = z
  .object({
    schemaVersion: z.literal(COMMAND_ENVELOPE_SCHEMA_VERSION),
    commandId: nonBlank(MAX_COMMAND_ID_LENGTH),
    commandType: nonBlank(MAX_COMMAND_TYPE_LENGTH),
    aggregateType: nonBlank(MAX_AGGREGATE_TYPE_LENGTH),
    aggregateId: nonBlank(MAX_AGGREGATE_ID_LENGTH),
    expectedVersion: z.number().int().nonnegative().finite(),
    idempotencyKey: nonBlank(MAX_COMMAND_IDEMPOTENCY_KEY_LENGTH),
    requestDigest: contentDigestSchema,
    actor: actorRefSchema,
    authorizationContext: authorizationContextSchema,
    correlationId: nonBlank(MAX_COMMAND_TRACE_ID_LENGTH),
    causationId: nonBlank(MAX_COMMAND_TRACE_ID_LENGTH).optional(),
    submittedAt: z.string().datetime({ offset: true }),
    payload: z.unknown(),
  })
  .strict();

const commandReceiptSchema = z
  .object({
    schemaVersion: z.literal(COMMAND_RECEIPT_SCHEMA_VERSION),
    commandId: nonBlank(MAX_COMMAND_ID_LENGTH),
    status: z.enum(CommandStatus),
    requestDigest: contentDigestSchema,
    committedVersion: z.number().int().nonnegative().finite().optional(),
    errorCode: z.enum(CommandErrorCode).optional(),
    errorMessage: nonBlank(2_000).optional(),
    duplicateOfCommandId: nonBlank(MAX_COMMAND_ID_LENGTH).optional(),
  })
  .strict()
  .superRefine((receipt, context) => {
    if (receipt.status === CommandStatus.Committed && receipt.committedVersion === undefined) {
      context.addIssue({
        code: "custom",
        message: "Committed receipt requires committedVersion.",
        path: ["committedVersion"],
      });
    }
    if (receipt.status !== CommandStatus.Committed && receipt.committedVersion !== undefined) {
      context.addIssue({
        code: "custom",
        message: "Only committed receipt may contain committedVersion.",
        path: ["committedVersion"],
      });
    }
    if (
      receipt.status !== CommandStatus.Committed &&
      receipt.status !== CommandStatus.Duplicate &&
      receipt.errorCode === undefined
    ) {
      context.addIssue({
        code: "custom",
        message: "Rejected, conflict, and outcomeUnknown receipts require errorCode.",
        path: ["errorCode"],
      });
    }
    if (receipt.status === CommandStatus.Committed && receipt.errorCode !== undefined) {
      context.addIssue({
        code: "custom",
        message: "Committed receipt cannot contain errorCode.",
        path: ["errorCode"],
      });
    }
    if (receipt.errorMessage !== undefined && receipt.errorCode === undefined) {
      context.addIssue({
        code: "custom",
        message: "errorMessage requires errorCode.",
        path: ["errorMessage"],
      });
    }
    if (receipt.status === CommandStatus.Duplicate && receipt.duplicateOfCommandId === undefined) {
      context.addIssue({
        code: "custom",
        message: "Duplicate receipt requires duplicateOfCommandId.",
        path: ["duplicateOfCommandId"],
      });
    }
    if (receipt.status !== CommandStatus.Duplicate && receipt.duplicateOfCommandId !== undefined) {
      context.addIssue({
        code: "custom",
        message: "Only duplicate receipt may contain duplicateOfCommandId.",
        path: ["duplicateOfCommandId"],
      });
    }
  });

/** 校验并构造一个版本化 Command Envelope，不产生 ID、时间或其他副作用。 */
export function createCommandEnvelope<TPayload>(
  input: CommandEnvelopeInput<TPayload>,
): Result<CommandEnvelope<TPayload>, HarnessError> {
  return parseCommandEnvelope({
    ...input,
    schemaVersion: input.schemaVersion ?? COMMAND_ENVELOPE_SCHEMA_VERSION,
  }) as Result<CommandEnvelope<TPayload>, HarnessError>;
}

/** 校验未知输入并解析为版本化 Command Envelope。 */
export function parseCommandEnvelope(
  input: unknown,
): Result<CommandEnvelope<unknown>, HarnessError> {
  const parsed = commandEnvelopeSchema.safeParse(input);
  return parsed.success
    ? success(mapCommandEnvelope(parsed.data))
    : failure(createCommandSchemaError(parsed.error, "Command Envelope Schema 无效。"));
}

/** 校验并构造一个 Command Receipt，不访问 Store 或执行任何副作用。 */
export function createCommandReceipt(
  input: CommandReceiptInput,
): Result<CommandReceipt, HarnessError> {
  return parseCommandReceipt({
    ...input,
    schemaVersion: input.schemaVersion ?? COMMAND_RECEIPT_SCHEMA_VERSION,
  });
}

/** 校验未知输入并解析为版本化 Command Receipt。 */
export function parseCommandReceipt(input: unknown): Result<CommandReceipt, HarnessError> {
  const parsed = commandReceiptSchema.safeParse(input);
  return parsed.success
    ? success(mapCommandReceipt(parsed.data))
    : failure(createCommandSchemaError(parsed.error, "Command Receipt Schema 无效。"));
}

/** 判断未知值是否为受支持的 Command 状态。 */
export function isCommandStatus(value: unknown): value is CommandStatus {
  return Object.values(CommandStatus).some((status) => status === value);
}

/** 判断未知值是否为受支持的 Command 错误分类。 */
export function isCommandErrorCode(value: unknown): value is CommandErrorCode {
  return Object.values(CommandErrorCode).some((code) => code === value);
}

function createCommandSchemaError(error: z.ZodError, message: string): HarnessError {
  const issue = error.issues[0];
  return new HarnessError(
    HarnessErrorCode.InvalidInput,
    message,
    {
      path: issue?.path.join(".") ?? "unknown",
      issue: issue?.message ?? "unknown",
    },
    error,
  );
}

function mapCommandEnvelope(
  input: z.output<typeof commandEnvelopeSchema>,
): CommandEnvelope<unknown> {
  return {
    schemaVersion: input.schemaVersion,
    commandId: input.commandId,
    commandType: input.commandType,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    expectedVersion: input.expectedVersion,
    idempotencyKey: input.idempotencyKey,
    requestDigest: input.requestDigest,
    actor: input.actor,
    authorizationContext: input.authorizationContext,
    correlationId: input.correlationId,
    ...(input.causationId === undefined ? {} : { causationId: input.causationId }),
    submittedAt: input.submittedAt,
    payload: input.payload,
  };
}

function mapCommandReceipt(input: z.output<typeof commandReceiptSchema>): CommandReceipt {
  return {
    schemaVersion: input.schemaVersion,
    commandId: input.commandId,
    status: input.status,
    requestDigest: input.requestDigest,
    ...(input.committedVersion === undefined ? {} : { committedVersion: input.committedVersion }),
    ...(input.errorCode === undefined ? {} : { errorCode: input.errorCode }),
    ...(input.errorMessage === undefined ? {} : { errorMessage: input.errorMessage }),
    ...(input.duplicateOfCommandId === undefined
      ? {}
      : { duplicateOfCommandId: input.duplicateOfCommandId }),
  };
}
