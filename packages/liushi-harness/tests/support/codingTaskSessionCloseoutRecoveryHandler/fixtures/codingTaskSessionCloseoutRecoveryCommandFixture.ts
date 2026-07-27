import {
  createCommandEnvelope,
  type CommandEnvelope,
} from "../../../../src/application/command/index.js";
import { CODING_TASK_SESSION_CLOSEOUT_AGGREGATE_TYPE } from "../../../../src/application/codingTaskSessionCloseout/index.js";
import {
  CODING_TASK_SESSION_CLOSEOUT_RECOVERY_COMMAND_TYPE,
  type CodingTaskSessionCloseoutRecoveryCommand,
  type CodingTaskSessionCloseoutRecoveryResolution,
} from "../../../../src/application/codingTaskSessionCloseoutRecovery/index.js";
import { ActorKind, type ContentDigest } from "../../../../src/common/index.js";
import { digestOf, session, unwrap, workspace } from "../../codingTaskSessionCloseout/index.js";

/** 构造严格的 Closeout Recovery Human Command。 */
export function recoveryCommand(
  resolution: CodingTaskSessionCloseoutRecoveryResolution,
  assessmentDigest: ContentDigest,
  expectedVersion: number,
  expectedDigest?: ContentDigest,
  commandId = "recovery-command",
): CommandEnvelope<CodingTaskSessionCloseoutRecoveryCommand["payload"]> {
  const payload = {
    workspaceId: workspace,
    sessionId: session,
    expectedAssessmentDigest: expectedDigest ?? assessmentDigest,
    requestedResolution: resolution,
  };
  return unwrap(
    createCommandEnvelope({
      commandId,
      commandType: CODING_TASK_SESSION_CLOSEOUT_RECOVERY_COMMAND_TYPE,
      aggregateType: CODING_TASK_SESSION_CLOSEOUT_AGGREGATE_TYPE,
      aggregateId: session,
      expectedVersion,
      idempotencyKey: "recovery-idempotency-key",
      requestDigest: digestOf(payload),
      actor: { kind: ActorKind.Human, actorId: "recovery-reviewer" },
      authorizationContext: {},
      correlationId: "recovery-correlation",
      causationId: "recovery-causation",
      submittedAt: "2026-07-27T00:00:00.000Z",
      payload,
    }),
  );
}
