import type { CommandEnvelope } from "#application/command/index.js";
import type { CodingTaskRepository, ContentDigestPort } from "#application/ports/index.js";
import type { RunVerificationCommandPayload } from "#application/verificationCommand/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import {
  CodingTaskAttemptOutcome,
  CodingTaskPhase,
  CodingTaskRunState,
  CodingTaskVerificationOutcome,
  parseCodingTaskId,
  type CodingTaskAggregate,
} from "#domain/codingTask/index.js";
import { parseWorkspaceId } from "#domain/workspace/index.js";

import type { CodingTaskCellVerificationBindingInput } from "../contracts/index.js";
import { CodingTaskCellRevisionBinding } from "../enums/index.js";

/** 从权威 CodingTask Aggregate 物化完整 Verification Command。 */
export class CodingTaskCellVerificationBindingService {
  public constructor(
    private readonly repository: CodingTaskRepository,
    private readonly digest: ContentDigestPort,
  ) {}

  /** 绑定最新实现 Checkpoint，并为最终 Payload 重算请求摘要。 */
  public async bind(
    input: CodingTaskCellVerificationBindingInput,
  ): Promise<Result<CommandEnvelope<RunVerificationCommandPayload>, HarnessError>> {
    if (input.binding !== CodingTaskCellRevisionBinding.LatestImplementationCheckpoint) {
      return failure(invalidBinding("binding"));
    }
    const codingTaskId = parseCodingTaskId(input.command.aggregateId);
    if (codingTaskId.status === ResultStatus.Failure) return codingTaskId;
    const workspaceId = parseWorkspaceId(input.command.payload.workspaceId);
    if (workspaceId.status === ResultStatus.Failure) return workspaceId;
    const loaded = await this.repository.load({
      workspaceId: workspaceId.value,
      codingTaskId: codingTaskId.value,
    });
    if (loaded.status === ResultStatus.Failure) return loaded;
    const aggregate = loaded.value.aggregate;
    const validated = validateAggregateBinding(aggregate, input);
    if (validated.status === ResultStatus.Failure) return validated;
    const payload: RunVerificationCommandPayload = {
      ...input.command.payload,
      plan: {
        ...input.command.payload.plan,
        targetRevision: validated.value,
      },
    };
    const requestDigest = this.digest.calculate(payload);
    return requestDigest.status === ResultStatus.Failure
      ? requestDigest
      : success({ ...input.command, requestDigest: requestDigest.value, payload });
  }
}

function validateAggregateBinding(
  aggregate: CodingTaskAggregate,
  input: CodingTaskCellVerificationBindingInput,
): Result<string, HarnessError> {
  const payload = input.command.payload;
  const attempt = aggregate.attempts.at(-1);
  const identityMatches =
    aggregate.workspaceId === payload.workspaceId &&
    aggregate.codingTaskId === input.command.aggregateId &&
    aggregate.repositoryId === payload.plan.repositoryId &&
    aggregate.worktreeBinding.worktreeId === payload.plan.worktreeId &&
    aggregate.worktreeBinding.branchName === payload.plan.expectedBranchName &&
    aggregate.baseRevision === payload.plan.baseRevision &&
    attempt?.number === payload.attemptNumber;
  if (!identityMatches || attempt?.targetRevision === undefined) {
    return failure(invalidBinding("identity"));
  }
  const firstExecution =
    aggregate.phase === CodingTaskPhase.Verification &&
    aggregate.runState === CodingTaskRunState.Active &&
    attempt.outcome === CodingTaskAttemptOutcome.Succeeded &&
    attempt.verificationOutcome === undefined;
  const completedReplay =
    aggregate.phase === CodingTaskPhase.Verification &&
    aggregate.runState === CodingTaskRunState.Completed &&
    attempt.outcome === CodingTaskAttemptOutcome.Succeeded &&
    attempt.verificationOutcome === CodingTaskVerificationOutcome.Passed;
  return firstExecution || completedReplay
    ? success(attempt.targetRevision)
    : failure(invalidBinding("state"));
}

function invalidBinding(field: string): HarnessError {
  return new HarnessError(
    HarnessErrorCode.InvalidStateTransition,
    "CodingTask Cell Verification Revision Binding 不兼容。",
    { field },
  );
}
