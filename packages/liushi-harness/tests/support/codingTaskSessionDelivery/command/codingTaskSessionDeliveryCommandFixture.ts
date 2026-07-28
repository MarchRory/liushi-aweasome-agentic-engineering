import {
  CODING_TASK_AGGREGATE_TYPE,
  CODING_TASK_SESSION_DELIVERY_SUBMISSION_COMMAND_TYPE,
  COMMAND_ENVELOPE_SCHEMA_VERSION,
  CodingTaskSessionEffectiveCloseoutStatus,
  ResultStatus,
} from "../../../../src/index.js";

import type { CodingTaskSessionCloseoutCliSetup } from "../../codingTaskSessionCloseoutCli/index.js";
import { digestCloseoutCliValue } from "../../codingTaskSessionCloseoutCli/index.js";
import { loadCodingTaskSessionDeliveryAggregate } from "../persistence/index.js";

/** Delivery E2E 命令可覆盖的稳定身份字段。 */
export interface CodingTaskSessionDeliveryCommandOverrides {
  /** 使用新命令验证 Handler 级幂等时覆盖 Command ID。 */
  readonly commandId?: string;
}

/** 从当前 Effective Closeout 与权威 CodingTask 版本构造 Delivery Command。 */
export async function createCodingTaskSessionDeliveryCommand(
  setup: CodingTaskSessionCloseoutCliSetup,
  overrides: CodingTaskSessionDeliveryCommandOverrides = {},
): Promise<Record<string, unknown>> {
  const effective = await setup.application.resolveCodingTaskSessionEffectiveCloseout.resolve({
    workspaceId: setup.workspaceId,
    sessionId: setup.sessionId,
  });
  if (effective.status === ResultStatus.Failure) throw effective.error;
  if (effective.value.status !== CodingTaskSessionEffectiveCloseoutStatus.Resolved) {
    throw new Error("Delivery Command 只能绑定已解析的 Effective Closeout。");
  }
  const aggregate = await loadCodingTaskSessionDeliveryAggregate(setup);
  const commandId = overrides.commandId ?? "closeout-cli-delivery-submission";
  const payload = {
    workspaceId: setup.workspaceId,
    sessionId: setup.sessionId,
    expectedCheckpointBindingDigest: effective.value.checkpoint.bindingDigest,
    expectedEffectiveSource: effective.value.source,
  };
  return {
    schemaVersion: COMMAND_ENVELOPE_SCHEMA_VERSION,
    commandId,
    commandType: CODING_TASK_SESSION_DELIVERY_SUBMISSION_COMMAND_TYPE,
    aggregateType: CODING_TASK_AGGREGATE_TYPE,
    aggregateId: setup.codingTaskId,
    expectedVersion: aggregate.version,
    idempotencyKey: commandId,
    requestDigest: digestCloseoutCliValue(payload),
    actor: { kind: "agent", actorId: setup.agentActorId },
    authorizationContext: {},
    correlationId: setup.closeoutCommand["correlationId"],
    causationId: setup.closeoutCommand["commandId"],
    submittedAt: setup.closeoutCommand["submittedAt"],
    payload,
  };
}
