import { codingTaskVersionConflict } from "#application/codingTask/index.js";
import {
  CodingTaskSessionEffectiveCloseoutStatus,
  type CodingTaskSessionEffectiveCloseoutResolution,
} from "#application/codingTaskSessionCloseoutRecovery/index.js";
import type { CodingTaskSessionCloseoutState } from "#application/codingTaskSessionCloseoutState/index.js";
import {
  hasSameChangeSetCheckpoint,
  type ChangeSetCheckpoint,
} from "#application/changeSetCheckpoint/index.js";
import { matchesImplementationCheckpoint } from "#application/implementationSubmission/index.js";
import { HarnessError, HarnessErrorCode, failure, success, type Result } from "#common/index.js";
import {
  CodingTaskPhase,
  CodingTaskRunState,
  type CodingTaskAggregate,
} from "#domain/codingTask/index.js";

import type { CodingTaskSessionDeliverySubmissionCommand } from "../../command/index.js";
import { CodingTaskSessionDeliverySubmissionDisposition } from "../../enums/index.js";

/** 复验 Handoff Command、Closeout State 与 CodingTask 的不可变身份。 */
export function validateCodingTaskSessionDeliveryAuthority(
  command: CodingTaskSessionDeliverySubmissionCommand,
  state: CodingTaskSessionCloseoutState,
  aggregate: CodingTaskAggregate,
): Result<void, HarnessError> {
  if (aggregate.version !== command.expectedVersion) {
    return failure(codingTaskVersionConflict(command.expectedVersion, aggregate.version));
  }
  if (
    state.workspaceId !== command.payload.workspaceId ||
    state.sessionId !== command.payload.sessionId ||
    state.codingTaskId !== command.aggregateId ||
    aggregate.workspaceId !== state.workspaceId ||
    aggregate.codingTaskId !== state.codingTaskId ||
    aggregate.sourceTaskId !== state.sourceTaskId ||
    aggregate.repositoryId !== state.repositoryId
  ) {
    return precondition(
      "Session Delivery 的 Workspace、Session、CodingTask 或 Repository 身份漂移。",
    );
  }
  if (
    command.actor.kind !== state.actor.kind ||
    command.actor.actorId !== state.actor.actorId ||
    command.correlationId !== state.correlationId ||
    command.causationId !== state.commandId
  ) {
    return precondition("Session Delivery Command 的 Actor 或因果链与 Closeout 不一致。");
  }
  if (
    Date.parse(command.submittedAt) < Date.parse(state.updatedAt) ||
    state.snapshot === null ||
    state.coverageManifest === null ||
    state.coverageBindingDigest === null
  ) {
    return precondition("Session Delivery 缺少完成交付所需的时间、Snapshot 或 Coverage 绑定。");
  }
  return success(undefined);
}

/** 从 Effective Closeout 解析调用方已明确绑定的权威 Checkpoint。 */
export function resolveCodingTaskSessionDeliveryCheckpoint(
  command: CodingTaskSessionDeliverySubmissionCommand,
  resolution: CodingTaskSessionEffectiveCloseoutResolution,
): Result<ChangeSetCheckpoint, HarnessError> {
  if (resolution.status !== CodingTaskSessionEffectiveCloseoutStatus.Resolved) {
    return precondition("Effective Closeout 尚未解析，禁止进入 Submission。", {
      reason: resolution.reason,
    });
  }
  if (
    resolution.source !== command.payload.expectedEffectiveSource ||
    resolution.checkpoint.bindingDigest !== command.payload.expectedCheckpointBindingDigest
  ) {
    return precondition("Effective Closeout 来源或 Checkpoint Binding Digest 已漂移。");
  }
  return success(resolution.checkpoint);
}

/** 精确比较 Effective Checkpoint 与 Repository Lock 内的新鲜只读复验结果。 */
export function validateFreshCodingTaskSessionDeliveryCheckpoint(
  expected: ChangeSetCheckpoint,
  inspected: ChangeSetCheckpoint,
): Result<void, HarnessError> {
  return hasSameChangeSetCheckpoint(expected, inspected)
    ? success(undefined)
    : precondition("Effective Closeout Checkpoint 与当前 Git 复验结果不一致。");
}

/** 判断需要首次提交 Event，或已精确提交同一个 Checkpoint。 */
export function classifyCodingTaskSessionDeliverySubmission(
  aggregate: CodingTaskAggregate,
  attemptNumber: number,
  checkpoint: ChangeSetCheckpoint,
): Result<CodingTaskSessionDeliverySubmissionDisposition, HarnessError> {
  if (matchesImplementationCheckpoint(aggregate, attemptNumber, checkpoint.checkpoint)) {
    return success(CodingTaskSessionDeliverySubmissionDisposition.AlreadySubmitted);
  }
  const attempt = aggregate.attempts.at(-1);
  if (
    aggregate.phase === CodingTaskPhase.Implementation &&
    aggregate.runState === CodingTaskRunState.Active &&
    attempt?.number === attemptNumber &&
    attempt.finishedAt === undefined &&
    attempt.outcome === undefined
  ) {
    return success(CodingTaskSessionDeliverySubmissionDisposition.SubmitRequired);
  }
  return precondition("CodingTask 当前状态既不能接纳 Submission，也不是同一 Checkpoint 的重放。");
}

function precondition(
  message: string,
  details: Readonly<Record<string, string>> = {},
): Result<never, HarnessError> {
  return failure(new HarnessError(HarnessErrorCode.PreconditionNotMet, message, details));
}
