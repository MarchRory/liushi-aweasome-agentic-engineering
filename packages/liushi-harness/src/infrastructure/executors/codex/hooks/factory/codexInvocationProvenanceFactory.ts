import {
  COMMAND_INVOCATION_PROVENANCE_SCHEMA_VERSION,
  type CommandInvocationProvenance,
} from "#application/index.js";
import type { ContentDigestPort } from "#application/ports/index.js";
import {
  ResultStatus,
  success,
  type ContentDigest,
  type HarnessError,
  type Result,
} from "#common/index.js";

import type { CodexHookInput } from "../contracts/index.js";

/** 从已解析的 Codex Hook 调用生成不包含原始宿主标识的 Command provenance。 */
export function createCodexInvocationProvenance(
  input: CodexHookInput,
  normalizedTargets: readonly string[],
  inputDigest: ContentDigest,
  digest: ContentDigestPort,
): Result<CommandInvocationProvenance, HarnessError> {
  const sessionIdDigest = digest.calculate(input.session_id);
  if (sessionIdDigest.status === ResultStatus.Failure) return sessionIdDigest;
  const turnIdDigest = digest.calculate(input.turn_id);
  if (turnIdDigest.status === ResultStatus.Failure) return turnIdDigest;
  const toolCallIdDigest = digest.calculate(input.tool_use_id);
  if (toolCallIdDigest.status === ResultStatus.Failure) return toolCallIdDigest;
  const targetsDigest = digest.calculate(normalizedTargets);
  if (targetsDigest.status === ResultStatus.Failure) return targetsDigest;
  const invocationId = digest.calculate({
    executor: "codex",
    sessionIdDigest: sessionIdDigest.value,
    turnIdDigest: turnIdDigest.value,
    toolCallIdDigest: toolCallIdDigest.value,
    toolName: input.tool_name,
  });
  if (invocationId.status === ResultStatus.Failure) return invocationId;
  return success({
    schemaVersion: COMMAND_INVOCATION_PROVENANCE_SCHEMA_VERSION,
    executor: "codex",
    invocationId: invocationId.value,
    sessionIdDigest: sessionIdDigest.value,
    turnIdDigest: turnIdDigest.value,
    toolCallIdDigest: toolCallIdDigest.value,
    toolName: input.tool_name,
    targetsDigest: targetsDigest.value,
    inputDigest,
  });
}

/** 构造调用在 Harness Workspace 与 Task 内的无歧义作用域摘要输入。 */
export interface CodexInvocationScopeInput {
  /** Hook Binding 使用的规范 Workspace Root。 */
  readonly workspaceRoot: string;
  /** Harness Workspace 标识。 */
  readonly workspaceId: string;
  /** Harness Task 标识。 */
  readonly taskId: string;
  /** 已通过结构摘要生成的宿主调用标识。 */
  readonly invocationId: ContentDigest;
}

/** 将宿主调用与 Harness Workspace、Task 绑定为全局 Command 作用域摘要。 */
export function createCodexInvocationScopeId(
  input: CodexInvocationScopeInput,
  digest: ContentDigestPort,
): Result<ContentDigest, HarnessError> {
  return digest.calculate({
    executor: "codex",
    workspaceRoot: input.workspaceRoot,
    workspaceId: input.workspaceId,
    taskId: input.taskId,
    invocationId: input.invocationId,
  });
}
