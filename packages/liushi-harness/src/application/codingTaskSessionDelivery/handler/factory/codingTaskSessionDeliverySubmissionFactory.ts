import {
  CodingTaskCommandType,
  type CodingTaskCommandPayload,
} from "#application/codingTask/index.js";
import type { CommandEnvelope } from "#application/command/index.js";
import type { ContentDigestPort, GitCheckpoint } from "#application/ports/index.js";
import { ResultStatus, success, type HarnessError, type Result } from "#common/index.js";

import type { CodingTaskSessionDeliverySubmissionCommand } from "../../command/index.js";

/** 从已复验 Checkpoint 构造唯一的内部 ImplementationSubmitted Command。 */
export function createCodingTaskSessionDeliveryImplementationCommand(
  digest: ContentDigestPort,
  command: CodingTaskSessionDeliverySubmissionCommand,
  attemptNumber: number,
  checkpoint: GitCheckpoint,
): Result<CommandEnvelope<CodingTaskCommandPayload>, HarnessError> {
  const payload = {
    workspaceId: command.payload.workspaceId,
    attemptNumber,
    targetRevision: checkpoint.targetRevision,
    changedPaths: checkpoint.changedPaths,
  };
  const requestDigest = digest.calculate(payload);
  if (requestDigest.status === ResultStatus.Failure) return requestDigest;
  return success({
    ...command,
    commandType: CodingTaskCommandType.SubmitImplementation,
    idempotencyKey: `${command.idempotencyKey}.implementation-submitted`,
    requestDigest: requestDigest.value,
    payload,
  });
}
