import { z } from "zod";

import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  parseContentDigest,
  success,
  type Result,
} from "#common/index.js";
import { parseWorkspaceId, type WorkspaceId } from "#domain/workspace/index.js";

import { CodingTaskSessionAdmissionSchemaVersion } from "../constants/index.js";
import type {
  CodingTaskSessionAdmissionBeginPendingInput,
  CodingTaskSessionAdmissionCommitPendingInput,
  CodingTaskSessionAdmissionPending,
  CodingTaskSessionAdmissionState,
  CodingTaskSessionAdmissionStateInput,
  CodingTaskSessionAdmissionTimestampInput,
} from "../contracts/index.js";
import { CodingTaskSessionAdmissionStatus } from "../enums/index.js";
import { parseCodingTaskSessionId, type CodingTaskSessionId } from "../identifiers/index.js";

const nonBlank = (field: string): z.ZodString =>
  z
    .string()
    .min(1)
    .refine((value) => value === value.trim(), { message: `${field} 涓嶅緱鍖呭惈棣栧熬绌虹櫧` })
    .refine((value) => !value.includes("\0"), { message: `${field} 涓嶅緱鍖呭惈 NUL` });

const isoUtc = z.string().refine(isIsoUtc, { message: "updatedAt 必须是规范 ISO UTC" });
const digest = z.string().transform((value, context) => {
  const result = parseContentDigest(value);
  if (result.status === ResultStatus.Failure) {
    context.addIssue({ code: "custom", message: "Content Digest 格式无效" });
    return z.NEVER;
  }
  return result.value;
});
const parsedWorkspaceId = z.string().transform((value, context): WorkspaceId => {
  const result = parseWorkspaceId(value);
  if (result.status === ResultStatus.Failure) {
    context.addIssue({ code: "custom", message: "workspaceId 格式无效" });
    return z.NEVER;
  }
  return result.value;
});
const parsedSessionId = z.string().transform((value, context): CodingTaskSessionId => {
  const result = parseCodingTaskSessionId(value);
  if (result.status === ResultStatus.Failure) {
    context.addIssue({ code: "custom", message: "sessionId 格式无效" });
    return z.NEVER;
  }
  return result.value;
});

const pendingSchema = z
  .object({
    actionId: nonBlank("actionId"),
    intentDigest: digest,
    executorSessionIdDigest: digest,
  })
  .strict();

const stateFields = {
  schemaVersion: z.literal(CodingTaskSessionAdmissionSchemaVersion.V1),
  workspaceId: parsedWorkspaceId,
  sessionId: parsedSessionId,
  activationBindingDigest: digest,
  sessionBindingDigest: digest,
  status: z.enum(CodingTaskSessionAdmissionStatus),
  pendingAdmission: pendingSchema.nullable(),
  admittedActionIds: z
    .array(nonBlank("admittedActionIds"))
    .refine((values) => new Set(values).size === values.length, {
      message: "admittedActionIds 不得重复",
    }),
  claimedExecutorSessionIdDigest: digest.nullable(),
  version: z.number().int().nonnegative().safe(),
  updatedAt: isoUtc,
} as const;

const stateSchema = z.object(stateFields).strict();
const stateInputSchema = z
  .object({
    workspaceId: parsedWorkspaceId,
    sessionId: parsedSessionId,
    activationBindingDigest: digest,
    sessionBindingDigest: digest,
    updatedAt: isoUtc,
  })
  .strict();

/** 创建 waiting_agent 初始 Admission Control State。 */
export function createCodingTaskSessionAdmissionState(
  input: unknown,
): Result<CodingTaskSessionAdmissionState, HarnessError> {
  const parsed = stateInputSchema.safeParse(input);
  if (!parsed.success) return invalid("Admission State 初始输入无效", parsed.error);
  const value = parsed.data as CodingTaskSessionAdmissionStateInput;
  return success(
    freezeState({
      schemaVersion: CodingTaskSessionAdmissionSchemaVersion.V1,
      workspaceId: value.workspaceId,
      sessionId: value.sessionId,
      activationBindingDigest: value.activationBindingDigest,
      sessionBindingDigest: value.sessionBindingDigest,
      status: CodingTaskSessionAdmissionStatus.WaitingAgent,
      pendingAdmission: null,
      admittedActionIds: [],
      claimedExecutorSessionIdDigest: null,
      version: 0,
      updatedAt: value.updatedAt,
    }),
  );
}

/** 严格重建持久化 Admission State，并拒绝未知字段或无效摘要。 */
export function rebuildCodingTaskSessionAdmissionState(
  input: unknown,
): Result<CodingTaskSessionAdmissionState, HarnessError> {
  const parsed = stateSchema.safeParse(input);
  if (!parsed.success) return invalid("持久化 Admission State 无效", parsed.error);
  const state = parsed.data as CodingTaskSessionAdmissionState;
  if (
    state.pendingAdmission !== null &&
    state.status !== CodingTaskSessionAdmissionStatus.WaitingAgent &&
    state.status !== CodingTaskSessionAdmissionStatus.OutcomeUnknown
  ) {
    return failure(
      new HarnessError(
        HarnessErrorCode.CorruptStore,
        "只有 waiting_agent 或 outcome_unknown 状态可以保留 pendingAdmission",
      ),
    );
  }
  if (state.claimedExecutorSessionIdDigest === null && state.admittedActionIds.length > 0) {
    return failure(
      new HarnessError(
        HarnessErrorCode.CorruptStore,
        "已有 admitted action 时必须保留 executor claim",
      ),
    );
  }
  return success(freezeState(state));
}

/** 严格校验 Pending Admission 输入。 */
export function parseCodingTaskSessionAdmissionPending(
  input: unknown,
): Result<CodingTaskSessionAdmissionPending, HarnessError> {
  const parsed = pendingSchema.safeParse(input);
  return parsed.success
    ? success(Object.freeze({ ...parsed.data }))
    : invalid("Admission Pending 输入无效", parsed.error);
}

/** 严格校验带更新时间的 Pending 输入。 */
export function parseCodingTaskSessionAdmissionBeginPendingInput(
  input: unknown,
): Result<CodingTaskSessionAdmissionBeginPendingInput, HarnessError> {
  return parsePendingTimestampInput(input, "开始 Admission Pending 输入无效");
}

/** 严格校验带更新时间的 Commit Pending 输入。 */
export function parseCodingTaskSessionAdmissionCommitPendingInput(
  input: unknown,
): Result<CodingTaskSessionAdmissionCommitPendingInput, HarnessError> {
  return parsePendingTimestampInput(input, "提交 Admission Pending 输入无效");
}

/** 严格校验状态迁移更新时间。 */
export function parseCodingTaskSessionAdmissionTimestampInput(
  input: unknown,
): Result<CodingTaskSessionAdmissionTimestampInput, HarnessError> {
  const parsed = z.object({ updatedAt: isoUtc }).strict().safeParse(input);
  return parsed.success
    ? success(parsed.data)
    : invalid("Admission State 更新时间无效", parsed.error);
}

/** 冻结状态及其嵌套集合，避免 transition 意外修改输入状态。 */
export function freezeCodingTaskSessionAdmissionState(
  state: CodingTaskSessionAdmissionState,
): CodingTaskSessionAdmissionState {
  return freezeState(state);
}

function parsePendingTimestampInput<
  T extends CodingTaskSessionAdmissionPending & { updatedAt: string },
>(input: unknown, message: string): Result<T, HarnessError> {
  const parsed = z
    .object({ ...pendingSchema.shape, updatedAt: isoUtc })
    .strict()
    .safeParse(input);
  return parsed.success
    ? success(Object.freeze({ ...parsed.data }) as T)
    : invalid(message, parsed.error);
}

function freezeState(state: CodingTaskSessionAdmissionState): CodingTaskSessionAdmissionState {
  const pending =
    state.pendingAdmission === null ? null : Object.freeze({ ...state.pendingAdmission });
  const admittedActionIds = Object.freeze([...state.admittedActionIds]);
  return Object.freeze({ ...state, pendingAdmission: pending, admittedActionIds });
}

function isIsoUtc(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
}

function invalid(message: string, cause?: unknown): Result<never, HarnessError> {
  return failure(new HarnessError(HarnessErrorCode.InvalidInput, message, {}, cause));
}
