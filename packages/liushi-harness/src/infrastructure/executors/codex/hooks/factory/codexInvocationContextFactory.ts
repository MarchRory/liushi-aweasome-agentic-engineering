import type { CommandInvocationProvenance } from "#application/index.js";
import type { ContentDigestPort } from "#application/ports/index.js";
import {
  ResultStatus,
  success,
  type ContentDigest,
  type HarnessError,
  type Result,
} from "#common/index.js";
import { parseActionId, type ActionId } from "#domain/actionJournal/index.js";

import type { CodexHookInput } from "../contracts/index.js";
import { deriveDeterministicUlid } from "../identity/index.js";
import {
  createCodexInvocationProvenance,
  createCodexInvocationScopeId,
} from "./codexInvocationProvenanceFactory.js";

/** 构造一次 Codex Hook 调用上下文所需的稳定输入。 */
export interface CodexInvocationContextInput {
  /** 已通过平台 Schema 校验的 Hook 输入。 */
  readonly hookInput: CodexHookInput;
  /** 从工具输入解析并规范化的目标集合。 */
  readonly targets: readonly string[];
  /** 完整工具输入的内容摘要。 */
  readonly inputDigest: ContentDigest;
  /** Hook Binding 使用的规范 Workspace Root。 */
  readonly workspaceRoot: string;
  /** Harness Workspace 标识。 */
  readonly workspaceId: string;
  /** Harness Task 标识。 */
  readonly taskId: string;
}

/** Codex Adapter 在 Pre/Post 阶段共享的无歧义调用上下文。 */
export interface CodexInvocationContext {
  /** 不包含原始宿主标识的持久化来源证明。 */
  readonly provenance: CommandInvocationProvenance;
  /** 绑定 Workspace 与 Task 的全局调用作用域摘要。 */
  readonly scopeId: ContentDigest;
  /** 从调用作用域摘要派生的领域 Action 标识。 */
  readonly actionId: ActionId;
}

/** 一次性构造 provenance、调用作用域和 Action 标识，供 Pre/Post 复用。 */
export function createCodexInvocationContext(
  input: CodexInvocationContextInput,
  digest: ContentDigestPort,
): Result<CodexInvocationContext, HarnessError> {
  const provenance = createCodexInvocationProvenance(
    input.hookInput,
    input.targets,
    input.inputDigest,
    digest,
  );
  if (provenance.status === ResultStatus.Failure) return provenance;
  const scopeId = createCodexInvocationScopeId(
    {
      workspaceRoot: input.workspaceRoot,
      workspaceId: input.workspaceId,
      taskId: input.taskId,
      invocationId: provenance.value.invocationId,
    },
    digest,
  );
  if (scopeId.status === ResultStatus.Failure) return scopeId;
  const actionId = parseActionId(deriveDeterministicUlid(scopeId.value));
  if (actionId.status === ResultStatus.Failure) return actionId;
  return success({
    provenance: provenance.value,
    scopeId: scopeId.value,
    actionId: actionId.value,
  });
}
