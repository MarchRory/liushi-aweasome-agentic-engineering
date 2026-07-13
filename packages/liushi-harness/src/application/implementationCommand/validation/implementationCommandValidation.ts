import { z } from "zod";

import { FileMutationKind, type FileMutation } from "#application/ports/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  parseContentDigest,
  success,
  type Result,
} from "#common/index.js";
import { parseActionId, type ActionId } from "#domain/actionJournal/index.js";
import { normalizeWriteSet } from "#domain/codingTask/index.js";
import { parseWorkspaceId, type WorkspaceId } from "#domain/workspace/index.js";

import type {
  ApplyImplementationCommandPayload,
  ImplementationCommandRuntimeContext,
} from "../contracts/index.js";

/** 已严格解析且路径顺序规范化的写入载荷。 */
export interface ValidatedApplyImplementationPayload {
  /** 已校验的 Workspace 标识。 */
  readonly workspaceId: WorkspaceId;
  /** 已校验的 Action 标识。 */
  readonly actionId: ActionId;
  /** 正在运行的实现 Attempt 序号。 */
  readonly attemptNumber: number;
  /** 已校验的运行时路径联合摘要。 */
  readonly runtimeRootDigest: ApplyImplementationCommandPayload["runtimeRootDigest"];
  /** 已校验且规范排序的文件目标状态。 */
  readonly mutations: readonly FileMutation[];
}

const mutationSchema = z
  .object({
    path: z.string(),
    kind: z.enum(FileMutationKind),
    expectedContentDigest: z.string().optional(),
    content: z.string(),
    contentDigest: z.string(),
  })
  .strict();

const payloadSchema = z
  .object({
    workspaceId: z.string(),
    actionId: z.string(),
    attemptNumber: z.number().int().positive(),
    runtimeRootDigest: z.string(),
    mutations: z.array(mutationSchema).min(1),
  })
  .strict();

/** 严格解析文件写入载荷及所有内容摘要。 */
export function parseApplyImplementationPayload(
  input: unknown,
): Result<ValidatedApplyImplementationPayload, HarnessError> {
  const parsed = payloadSchema.safeParse(input);
  if (!parsed.success) return failure(invalid("payload"));
  const workspaceId = parseWorkspaceId(parsed.data.workspaceId);
  if (workspaceId.status === ResultStatus.Failure) return workspaceId;
  const actionId = parseActionId(parsed.data.actionId);
  if (actionId.status === ResultStatus.Failure) return actionId;
  const runtimeRootDigest = parseContentDigest(parsed.data.runtimeRootDigest);
  if (runtimeRootDigest.status === ResultStatus.Failure) return runtimeRootDigest;

  let paths: readonly string[];
  try {
    paths = normalizeWriteSet(parsed.data.mutations.map((mutation) => mutation.path));
  } catch {
    return failure(invalid("mutations.path"));
  }
  if (
    paths.length !== parsed.data.mutations.length ||
    paths.some((path, index) => path !== parsed.data.mutations[index]?.path)
  ) {
    return failure(invalid("mutations.order"));
  }
  const mutations: FileMutation[] = [];
  for (const mutation of parsed.data.mutations) {
    const contentDigest = parseContentDigest(mutation.contentDigest);
    if (contentDigest.status === ResultStatus.Failure) return contentDigest;
    const expected =
      mutation.expectedContentDigest === undefined
        ? undefined
        : parseContentDigest(mutation.expectedContentDigest);
    if (expected?.status === ResultStatus.Failure) return expected;
    if (
      (mutation.kind === FileMutationKind.Create && expected !== undefined) ||
      (mutation.kind === FileMutationKind.Replace && expected === undefined)
    ) {
      return failure(invalid("mutations.expectedContentDigest"));
    }
    mutations.push({
      path: mutation.path,
      kind: mutation.kind,
      content: mutation.content,
      contentDigest: contentDigest.value,
      ...(expected === undefined ? {} : { expectedContentDigest: expected.value }),
    });
  }
  return success({
    workspaceId: workspaceId.value,
    actionId: actionId.value,
    attemptNumber: parsed.data.attemptNumber,
    runtimeRootDigest: runtimeRootDigest.value,
    mutations,
  });
}

/** 校验本地路径存在形式，不读取文件系统。 */
export function validateImplementationRuntime(
  input: ImplementationCommandRuntimeContext,
): Result<ImplementationCommandRuntimeContext, HarnessError> {
  if (!validAbsolutePath(input?.repositoryRoot)) {
    return failure(invalid("runtime"));
  }
  return success({ repositoryRoot: input.repositoryRoot });
}

function validAbsolutePath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    !/[\u0000-\u001f\u007f]/u.test(value) &&
    (value.startsWith("/") || value.startsWith("\\\\") || /^[A-Za-z]:[\\/]/u.test(value))
  );
}

function invalid(field: string): HarnessError {
  return new HarnessError(HarnessErrorCode.InvalidInput, "受控文件写入输入无效。", { field });
}
