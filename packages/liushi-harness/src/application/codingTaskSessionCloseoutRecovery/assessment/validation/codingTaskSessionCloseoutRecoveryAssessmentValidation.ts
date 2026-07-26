import { z } from "zod";

import {
  COMMAND_ENVELOPE_SCHEMA_VERSION,
  type CommandEnvelope,
} from "#application/command/index.js";
import { parseCodingTaskSessionCloseoutCommand } from "#application/codingTaskSessionCloseout/index.js";
import type { ContentDigestPort } from "#application/ports/contentDigest/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import {
  parseCodingTaskSessionId,
  type CodingTaskSessionId,
} from "#domain/codingTaskSession/index.js";
import { parseWorkspaceId, type WorkspaceId } from "#domain/workspace/index.js";
import {
  CODING_TASK_SESSION_CLOSEOUT_AGGREGATE_TYPE,
  CODING_TASK_SESSION_CLOSEOUT_COMMAND_TYPE,
} from "#application/codingTaskSessionCloseout/constants/index.js";

import type { CodingTaskSessionCloseoutState } from "#application/codingTaskSessionCloseoutState/index.js";
import type { CodingTaskSessionCloseoutCommand } from "#application/codingTaskSessionCloseout/index.js";

const inputSchema = z
  .object({
    workspaceId: z.string().min(1).max(256),
    sessionId: z.string().min(1).max(256),
  })
  .strict();

/** 严格解析公开 Assessment 输入，只接受 workspaceId 与 sessionId。 */
export function parseCodingTaskSessionCloseoutRecoveryInput(
  input: unknown,
): Result<
  { readonly workspaceId: WorkspaceId; readonly sessionId: CodingTaskSessionId },
  HarnessError
> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return failure(invalid("input"));
  const workspaceId = parseWorkspaceId(parsed.data.workspaceId);
  if (workspaceId.status === ResultStatus.Failure) return workspaceId;
  const sessionId = parseCodingTaskSessionId(parsed.data.sessionId);
  if (sessionId.status === ResultStatus.Failure) return sessionId;
  return success({ workspaceId: workspaceId.value, sessionId: sessionId.value });
}

/** 从 v3 State 重建固定 Closeout Command，并重新走现有严格 Command Parser。 */
export function rebuildCodingTaskSessionCloseoutCommand(
  state: CodingTaskSessionCloseoutState,
  digest: ContentDigestPort,
): Result<CodingTaskSessionCloseoutCommand, HarnessError> {
  const rawCommand: CommandEnvelope = {
    schemaVersion: COMMAND_ENVELOPE_SCHEMA_VERSION,
    commandId: state.commandId,
    commandType: CODING_TASK_SESSION_CLOSEOUT_COMMAND_TYPE,
    aggregateType: CODING_TASK_SESSION_CLOSEOUT_AGGREGATE_TYPE,
    aggregateId: state.sessionId,
    expectedVersion: 0,
    idempotencyKey: state.idempotencyKey,
    requestDigest: state.requestDigest,
    actor: state.actor,
    authorizationContext: {},
    correlationId: state.correlationId,
    ...(state.causationId === undefined ? {} : { causationId: state.causationId }),
    submittedAt: state.createdAt,
    payload: { workspaceId: state.workspaceId, sessionId: state.sessionId },
  };
  try {
    return parseCodingTaskSessionCloseoutCommand(rawCommand, digest);
  } catch (error) {
    return failure(
      new HarnessError(HarnessErrorCode.IoFailure, "Closeout Command 复验抛出异常。", {}, error),
    );
  }
}

/** 将权威依赖的异常转换为稳定 Harness Error。 */
export function createAssessmentInvocationError(message: string, cause?: unknown): HarnessError {
  return new HarnessError(HarnessErrorCode.IoFailure, message, {}, cause);
}

function invalid(field: string): HarnessError {
  return new HarnessError(
    HarnessErrorCode.InvalidInput,
    "Closeout Recovery Assessment 输入无效。",
    {
      field,
    },
  );
}
