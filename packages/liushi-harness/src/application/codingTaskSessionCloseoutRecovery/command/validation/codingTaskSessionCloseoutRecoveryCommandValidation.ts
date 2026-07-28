import { z } from "zod";

import { isCanonicalCommandTimestamp, parseCommandEnvelope } from "#application/command/index.js";
import { CODING_TASK_SESSION_CLOSEOUT_AGGREGATE_TYPE } from "#application/codingTaskSessionCloseout/index.js";
import type { ContentDigestPort } from "#application/ports/contentDigest/index.js";
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
import { parseCodingTaskSessionId } from "#domain/codingTaskSession/index.js";
import { parseWorkspaceId } from "#domain/workspace/index.js";

import { CODING_TASK_SESSION_CLOSEOUT_RECOVERY_COMMAND_TYPE } from "../../constants/index.js";
import { CodingTaskSessionCloseoutRecoveryResolution } from "../../enums/index.js";
import type { CodingTaskSessionCloseoutRecoveryCommand } from "../contracts/index.js";

const payloadSchema = z
  .object({
    workspaceId: z.string().min(1).max(256),
    sessionId: z.string().min(1).max(256),
    expectedAssessmentDigest: z.string(),
    requestedResolution: z.enum(CodingTaskSessionCloseoutRecoveryResolution),
  })
  .strict();

/** 解析并规范化 Closeout Recovery Command，保留 Envelope 的 expectedVersion。 */
export function parseCodingTaskSessionCloseoutRecoveryCommand(
  input: unknown,
  digest: ContentDigestPort,
): Result<CodingTaskSessionCloseoutRecoveryCommand, HarnessError> {
  const envelope = parseCommandEnvelope(input);
  if (envelope.status === ResultStatus.Failure) return envelope;
  if (
    envelope.value.commandType !== CODING_TASK_SESSION_CLOSEOUT_RECOVERY_COMMAND_TYPE ||
    envelope.value.aggregateType !== CODING_TASK_SESSION_CLOSEOUT_AGGREGATE_TYPE
  ) {
    return invalid("Closeout Recovery Command 类型或 Aggregate 类型不符合固定契约。");
  }
  if (envelope.value.actor.kind !== ActorKind.Human) {
    return forbidden("Closeout Recovery Command 必须由 Human Actor 提交。");
  }
  if (!isCanonicalCommandTimestamp(envelope.value.submittedAt)) {
    return invalid("Closeout Recovery Command submittedAt 必须是规范 UTC 时间。");
  }

  const payload = payloadSchema.safeParse(envelope.value.payload);
  if (!payload.success) {
    return invalid("Closeout Recovery Payload 必须精确包含四个固定字段。", payload.error);
  }

  const workspaceId = parseWorkspaceId(payload.data.workspaceId);
  if (workspaceId.status === ResultStatus.Failure) return workspaceId;
  const sessionId = parseCodingTaskSessionId(payload.data.sessionId);
  if (sessionId.status === ResultStatus.Failure) return sessionId;
  const expectedAssessmentDigest = parseContentDigest(payload.data.expectedAssessmentDigest);
  if (expectedAssessmentDigest.status === ResultStatus.Failure) return expectedAssessmentDigest;
  if (envelope.value.aggregateId !== sessionId.value) {
    return invalid("Closeout Recovery aggregateId 必须等于 payload.sessionId。");
  }

  const normalizedPayload = {
    workspaceId: workspaceId.value,
    sessionId: sessionId.value,
    expectedAssessmentDigest: expectedAssessmentDigest.value,
    requestedResolution: payload.data.requestedResolution,
  };
  const expectedDigest = digest.calculate(normalizedPayload);
  if (expectedDigest.status === ResultStatus.Failure) return expectedDigest;
  if (expectedDigest.value !== envelope.value.requestDigest) {
    return invalid("Closeout Recovery requestDigest 必须等于规范化 Payload Digest。");
  }

  return success({
    ...envelope.value,
    payload: normalizedPayload,
  });
}

function invalid(message: string, cause?: unknown): Result<never, HarnessError> {
  return failure(new HarnessError(HarnessErrorCode.InvalidInput, message, {}, cause));
}

function forbidden(message: string): Result<never, HarnessError> {
  return failure(new HarnessError(HarnessErrorCode.OperationForbidden, message));
}
