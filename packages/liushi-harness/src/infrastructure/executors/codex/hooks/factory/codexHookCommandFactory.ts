import {
  createCommandEnvelope,
  type ActionHookPayload,
  type CommandEnvelope,
  type CommandInvocationProvenance,
} from "#application/index.js";
import type { ContentDigestPort } from "#application/ports/index.js";
import { ResultStatus, type HarnessError, type Result } from "#common/index.js";

/** Codex Hook Command 构造所需的稳定输入。 */
export interface CodexHookCommandFactoryInput {
  /** 已通过 Canonical Schema 校验的 Hook Payload。 */
  readonly payload: ActionHookPayload;
  /** 不包含宿主原始标识的调用来源证明。 */
  readonly invocationProvenance: CommandInvocationProvenance;
  /** Action Journal 的期望版本。 */
  readonly expectedVersion: number;
  /** PostAction 绑定的直接上游 Command；PreAction 不提供。 */
  readonly causationId?: string;
}

/** 将 Canonical Hook Payload 与 Command Envelope 精确绑定。 */
export function createCodexHookCommand(
  input: CodexHookCommandFactoryInput,
  digest: ContentDigestPort,
): Result<CommandEnvelope, HarnessError> {
  const requestDigest = digest.calculate(input.payload);
  if (requestDigest.status === ResultStatus.Failure) return requestDigest;
  return createCommandEnvelope({
    commandId: String(input.payload["commandId"]),
    commandType: `hook.${String(input.payload["event"])}`,
    aggregateType: "action",
    aggregateId: String(input.payload["actionId"]),
    expectedVersion: input.expectedVersion,
    idempotencyKey: String(input.payload["hookExecutionId"]),
    requestDigest: requestDigest.value,
    actor: input.payload.actor,
    authorizationContext: { executor: "codex" },
    correlationId: String(input.payload["correlationId"]),
    ...(input.causationId === undefined ? {} : { causationId: input.causationId }),
    submittedAt: String(input.payload["occurredAt"]),
    invocationProvenance: input.invocationProvenance,
    payload: input.payload,
  });
}
