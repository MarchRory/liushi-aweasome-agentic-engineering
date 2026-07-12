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
import { parseActionId, type ActionId } from "#domain/actionJournal/index.js";
import { parseWorkspaceId, type WorkspaceId } from "#domain/workspace/index.js";

import { MAX_WORKTREE_PROVISION_ROOT_LENGTH } from "../constants/index.js";
import type {
  ProvisionWorktreeCommandPayload,
  ProvisionWorktreeRuntimeContext,
} from "../contracts/index.js";

/** 已解析且可供 Handler 使用的 Worktree Provision Payload。 */
export interface ValidatedProvisionWorktreePayload {
  /** 已校验 Workspace ID。 */
  readonly workspaceId: WorkspaceId;
  /** 已校验 Action ID。 */
  readonly actionId: ActionId;
  /** 已校验 Repository Root Digest。 */
  readonly repositoryRootDigest: ProvisionWorktreeCommandPayload["repositoryRootDigest"];
}

const payloadSchema = z
  .object({
    workspaceId: z.string(),
    actionId: z.string(),
    repositoryRootDigest: z.string(),
  })
  .strict();

/** 严格解析 Worktree Provision Command Payload。 */
export function parseProvisionWorktreePayload(
  input: unknown,
): Result<ValidatedProvisionWorktreePayload, HarnessError> {
  const parsed = payloadSchema.safeParse(input);
  if (!parsed.success) return failure(invalid("payload"));
  const workspaceId = parseWorkspaceId(parsed.data.workspaceId);
  if (workspaceId.status === ResultStatus.Failure) return workspaceId;
  const actionId = parseActionId(parsed.data.actionId);
  if (actionId.status === ResultStatus.Failure) return actionId;
  const repositoryRootDigest = parseContentDigest(parsed.data.repositoryRootDigest);
  if (repositoryRootDigest.status === ResultStatus.Failure) return repositoryRootDigest;
  return success({
    workspaceId: workspaceId.value,
    actionId: actionId.value,
    repositoryRootDigest: repositoryRootDigest.value,
  });
}

/** 校验不会持久化的本机 Runtime Root。 */
export function validateProvisionWorktreeRuntime(
  input: ProvisionWorktreeRuntimeContext,
): Result<ProvisionWorktreeRuntimeContext, HarnessError> {
  if (
    input === null ||
    typeof input !== "object" ||
    typeof input.repositoryRoot !== "string" ||
    input.repositoryRoot.length === 0 ||
    input.repositoryRoot.length > MAX_WORKTREE_PROVISION_ROOT_LENGTH ||
    /[\u0000-\u001f\u007f]/u.test(input.repositoryRoot) ||
    !isAbsolutePath(input.repositoryRoot)
  ) {
    return failure(invalid("repositoryRoot"));
  }
  return success({ repositoryRoot: input.repositoryRoot });
}

function isAbsolutePath(value: string): boolean {
  return value.startsWith("/") || value.startsWith("\\\\") || /^[A-Za-z]:[\\/]/u.test(value);
}

function invalid(field: string): HarnessError {
  return new HarnessError(HarnessErrorCode.InvalidInput, "Worktree Provision input is invalid.", {
    field,
  });
}
