import { z } from "zod";

import { ResultStatus, parseContentDigest } from "#common/index.js";
import { parseCommandReceipt, type CommandReceipt } from "#application/index.js";

import { COMMAND_RESERVATION_FILE_SCHEMA_VERSION } from "../constants/index.js";
import type { PersistedCommandReservation } from "../contracts/index.js";

const nonBlank = z
  .string()
  .min(1)
  .refine((value) => value === value.trim());
const digestSchema = z.string().transform((value, context) => {
  const parsed = parseContentDigest(value);
  if (parsed.status === ResultStatus.Failure) {
    context.addIssue({ code: "custom", message: parsed.error.message });
    return z.NEVER;
  }
  return parsed.value;
});
const receiptSchema = z.unknown().transform((value, context): CommandReceipt => {
  const parsed = parseCommandReceipt(value);
  if (parsed.status === ResultStatus.Failure) {
    context.addIssue({ code: "custom", message: parsed.error.message });
    return z.NEVER;
  }
  return parsed.value;
});
const reservationSchema = z
  .object({
    schemaVersion: z.literal(COMMAND_RESERVATION_FILE_SCHEMA_VERSION),
    aggregateType: nonBlank,
    aggregateId: nonBlank,
    commandType: nonBlank,
    idempotencyKey: nonBlank,
    commandId: nonBlank,
    requestDigest: digestSchema,
    submittedAt: z.string().datetime({ offset: true }),
    receipt: receiptSchema.optional(),
  })
  .strict();

/** 严格解析持久化 Command Reservation。 */
export function parsePersistedCommandReservation(input: unknown): PersistedCommandReservation {
  const parsed = reservationSchema.safeParse(input);
  if (!parsed.success) {
    throw parsed.error;
  }
  const { receipt, ...required } = parsed.data;
  return { ...required, ...(receipt === undefined ? {} : { receipt }) };
}
