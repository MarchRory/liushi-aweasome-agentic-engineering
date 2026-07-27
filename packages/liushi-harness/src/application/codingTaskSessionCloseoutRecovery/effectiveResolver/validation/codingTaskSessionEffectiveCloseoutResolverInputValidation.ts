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
  parseCodingTaskSessionId,
  type CodingTaskSessionId,
} from "#domain/codingTaskSession/index.js";
import { parseWorkspaceId, type WorkspaceId } from "#domain/workspace/index.js";

const inputSchema = z
  .object({
    workspaceId: z.string().min(1).max(256),
    sessionId: z.string().min(1).max(256),
  })
  .strict();

/** 严格解析只允许 Workspace/Session 两个字段的外部输入。 */
export function parseCodingTaskSessionEffectiveCloseoutResolverInput(
  input: unknown,
): Result<
  { readonly workspaceId: WorkspaceId; readonly sessionId: CodingTaskSessionId },
  HarnessError
> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return failure(invalidInput());

  const workspaceId = parseWorkspaceId(parsed.data.workspaceId);
  if (workspaceId.status === ResultStatus.Failure) return workspaceId;
  const sessionId = parseCodingTaskSessionId(parsed.data.sessionId);
  if (sessionId.status === ResultStatus.Failure) return sessionId;
  return success({ workspaceId: workspaceId.value, sessionId: sessionId.value });
}

function invalidInput(): HarnessError {
  return new HarnessError(HarnessErrorCode.InvalidInput, "Effective Closeout Resolver 输入无效。", {
    field: "input",
  });
}
