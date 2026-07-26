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

import { SESSION_HOOK_BINDING_SCHEMA_VERSION } from "../constants/index.js";
import type {
  HookBindingDigestPort,
  SessionHookBinding,
  SessionHookBindingInput,
} from "../contracts/index.js";

const nonBlank = (field: string, max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine((value) => value === value.trim(), { message: `${field} 不得包含首尾空白。` })
    .refine((value) => !value.includes("\0"), { message: `${field} 不得包含 NUL。` });

const digest = z.string().transform((value, context) => {
  const parsed = parseContentDigest(value);
  if (parsed.status === ResultStatus.Failure) {
    context.addIssue({ code: "custom", message: "Digest 格式无效。" });
    return z.NEVER;
  }
  return parsed.value;
});

const inputSchema = z
  .object({
    schemaVersion: z.literal(SESSION_HOOK_BINDING_SCHEMA_VERSION),
    workspaceRoot: nonBlank("workspaceRoot", 4_096),
    workspaceId: nonBlank("workspaceId", 256),
    taskId: nonBlank("taskId", 256),
    planRiskArtifactId: nonBlank("planRiskArtifactId", 256),
    planRiskArtifactDigest: digest,
    actorId: nonBlank("actorId", 256),
    boundAt: z.string().refine(isIsoUtc, { message: "boundAt 必须是规范 ISO UTC。" }),
    sessionId: nonBlank("sessionId", 256),
    codingTaskId: nonBlank("codingTaskId", 256),
    attemptNumber: z.number().int().positive().safe(),
    worktreeId: nonBlank("worktreeId", 256),
    worktreeRootDigest: digest,
    activationBindingDigest: digest,
  })
  .strict();

const recordSchema = inputSchema.extend({ sessionBindingDigest: digest }).strict();

/** 创建并计算新的 Session Hook Binding v2。 */
export function createSessionHookBinding(
  input: unknown,
  digestPort: HookBindingDigestPort,
): Result<SessionHookBinding, HarnessError> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return invalid("Session Hook Binding v2 输入无效。", parsed.error);
  const normalized = parsed.data as SessionHookBindingInput;
  const calculated = calculateSessionBindingDigest(normalized, digestPort);
  if (calculated.status === ResultStatus.Failure) return calculated;
  return success(Object.freeze({ ...normalized, sessionBindingDigest: calculated.value }));
}

/** 严格重建持久化 v2 Binding，并拒绝摘要漂移。 */
export function rebuildSessionHookBinding(
  input: unknown,
  digestPort: HookBindingDigestPort,
): Result<SessionHookBinding, HarnessError> {
  const parsed = recordSchema.safeParse(input);
  if (!parsed.success) return invalid("持久化 Session Hook Binding v2 无效。", parsed.error);
  const record = parsed.data as SessionHookBinding;
  const calculated = calculateSessionBindingDigest(record, digestPort);
  if (calculated.status === ResultStatus.Failure) return calculated;
  if (calculated.value !== record.sessionBindingDigest) {
    return failure(
      new HarnessError(HarnessErrorCode.PreconditionNotMet, "Session Binding Digest 漂移。", {
        field: "sessionBindingDigest",
      }),
    );
  }
  return success(Object.freeze({ ...record }));
}

/** 验证未知值是否为完整且摘要一致的 Session Hook Binding v2。 */
export function validateSessionHookBinding(
  input: unknown,
  digestPort: HookBindingDigestPort,
): Result<SessionHookBinding, HarnessError> {
  return rebuildSessionHookBinding(input, digestPort);
}

/** 创建 v2 Binding 的兼容别名。 */
export const createHookBindingV2 = createSessionHookBinding;

/** 重建 v2 Binding 的兼容别名。 */
export const rebuildHookBindingV2 = rebuildSessionHookBinding;

/** 验证 v2 Binding 的兼容别名。 */
export const validateHookBindingV2 = validateSessionHookBinding;

function calculateSessionBindingDigest(
  input: SessionHookBindingInput,
  digestPort: HookBindingDigestPort,
): Result<string, HarnessError> {
  const calculated = digestPort.calculate(toSessionBindingDigestInput(input));
  if (calculated.status === ResultStatus.Failure) return calculated;
  const parsed = parseContentDigest(calculated.value);
  return parsed.status === ResultStatus.Failure
    ? failure(new HarnessError(HarnessErrorCode.InvalidInput, "Digest Port 返回了无效摘要。"))
    : success(parsed.value);
}

function toSessionBindingDigestInput(input: SessionHookBindingInput): SessionHookBindingInput {
  return {
    schemaVersion: input.schemaVersion,
    workspaceRoot: input.workspaceRoot,
    workspaceId: input.workspaceId,
    taskId: input.taskId,
    planRiskArtifactId: input.planRiskArtifactId,
    planRiskArtifactDigest: input.planRiskArtifactDigest,
    actorId: input.actorId,
    boundAt: input.boundAt,
    sessionId: input.sessionId,
    codingTaskId: input.codingTaskId,
    attemptNumber: input.attemptNumber,
    worktreeId: input.worktreeId,
    worktreeRootDigest: input.worktreeRootDigest,
    activationBindingDigest: input.activationBindingDigest,
  };
}

function isIsoUtc(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
}

function invalid(message: string, cause?: unknown): Result<never, HarnessError> {
  return failure(new HarnessError(HarnessErrorCode.InvalidInput, message, {}, cause));
}
