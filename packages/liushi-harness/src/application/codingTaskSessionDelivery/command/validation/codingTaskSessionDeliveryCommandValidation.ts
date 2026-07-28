import { z } from "zod";

import { CODING_TASK_AGGREGATE_TYPE } from "#application/codingTask/index.js";
import { CodingTaskSessionEffectiveCloseoutSource } from "#application/codingTaskSessionCloseoutRecovery/index.js";
import { isCanonicalCommandTimestamp, parseCommandEnvelope } from "#application/command/index.js";
import type { ContentDigestPort } from "#application/ports/index.js";
import {
  ActorKind,
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  parseContentDigest,
  success,
  type Result,
} from "#common/index.js";
import { parseCodingTaskId } from "#domain/codingTask/index.js";
import { parseCodingTaskSessionId } from "#domain/codingTaskSession/index.js";
import { parseWorkspaceId } from "#domain/workspace/index.js";

import { CODING_TASK_SESSION_DELIVERY_SUBMISSION_COMMAND_TYPE } from "../../constants/index.js";
import type { CodingTaskSessionDeliverySubmissionCommand } from "../contracts/index.js";

const payloadSchema = z
  .object({
    workspaceId: z.string().min(1).max(256),
    sessionId: z.string().min(1).max(256),
    expectedCheckpointBindingDigest: z.string(),
    expectedEffectiveSource: z.enum(CodingTaskSessionEffectiveCloseoutSource),
  })
  .strict();

/** 解析 Session Delivery Submission Command 并重算规范 Payload 摘要。 */
export function parseCodingTaskSessionDeliverySubmissionCommand(
  input: unknown,
  digest: ContentDigestPort,
): Result<CodingTaskSessionDeliverySubmissionCommand, HarnessError> {
  const envelope = parseCommandEnvelope(input);
  if (envelope.status === ResultStatus.Failure) return envelope;
  if (
    envelope.value.commandType !== CODING_TASK_SESSION_DELIVERY_SUBMISSION_COMMAND_TYPE ||
    envelope.value.aggregateType !== CODING_TASK_AGGREGATE_TYPE ||
    envelope.value.expectedVersion < 1
  ) {
    return invalid("Session Delivery Submission Command 元数据不符合固定契约。");
  }
  if (envelope.value.actor.kind !== ActorKind.Agent) {
    return forbidden("Session Delivery Submission Command 必须由 Session Agent 发起。");
  }
  if (!isCanonicalCommandTimestamp(envelope.value.submittedAt)) {
    return invalid("Session Delivery Submission submittedAt 必须是规范 UTC 时间。");
  }
  const codingTaskId = parseCodingTaskId(envelope.value.aggregateId);
  if (codingTaskId.status === ResultStatus.Failure) return codingTaskId;

  const payload = payloadSchema.safeParse(envelope.value.payload);
  if (!payload.success) {
    return invalid("Session Delivery Submission Payload 必须精确包含四个固定字段。", payload.error);
  }
  const workspaceId = parseWorkspaceId(payload.data.workspaceId);
  if (workspaceId.status === ResultStatus.Failure) return workspaceId;
  const sessionId = parseCodingTaskSessionId(payload.data.sessionId);
  if (sessionId.status === ResultStatus.Failure) return sessionId;
  const checkpointDigest = parseContentDigest(payload.data.expectedCheckpointBindingDigest);
  if (checkpointDigest.status === ResultStatus.Failure) return checkpointDigest;

  const normalizedPayload = {
    workspaceId: workspaceId.value,
    sessionId: sessionId.value,
    expectedCheckpointBindingDigest: checkpointDigest.value,
    expectedEffectiveSource: payload.data.expectedEffectiveSource,
  };
  const requestDigest = digest.calculate(normalizedPayload);
  if (requestDigest.status === ResultStatus.Failure) return requestDigest;
  if (requestDigest.value !== envelope.value.requestDigest) {
    return invalid("Session Delivery Submission requestDigest 与规范 Payload 不一致。");
  }
  return success({
    ...envelope.value,
    aggregateId: codingTaskId.value,
    payload: normalizedPayload,
  });
}

function invalid(message: string, cause?: unknown): Result<never, HarnessError> {
  return failure(new HarnessError(HarnessErrorCode.InvalidInput, message, {}, cause));
}

function forbidden(message: string): Result<never, HarnessError> {
  return failure(new HarnessError(HarnessErrorCode.OperationForbidden, message));
}
