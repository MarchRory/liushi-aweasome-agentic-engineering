import { HarnessError, HarnessErrorCode, failure, success, type Result } from "#common/index.js";
import {
  CodingTaskPhase,
  CodingTaskRunState,
  type CodingTaskAggregate,
  type CodingTaskAttempt,
} from "#domain/codingTask/index.js";
import type { CodingTaskSessionActivationRecord } from "#domain/codingTaskSession/index.js";
import { GateEvaluationResult } from "#domain/policy/index.js";

import type { PreparedCodingTaskSessionActivation } from "../contracts/index.js";
import { CodingTaskSessionActivationStage } from "../enums/index.js";

/** 从权威 CodingTask Aggregate 验证当前 Session 的激活前置条件。 */
export function validateAuthoritativeCodingTaskSessionBinding(
  aggregate: CodingTaskAggregate,
  prepared: PreparedCodingTaskSessionActivation,
): Result<
  { readonly aggregate: CodingTaskAggregate; readonly attempt: CodingTaskAttempt },
  HarnessError
> {
  const attempt = aggregate.attempts.at(-1);
  const create = prepared.createPayload;
  const valid =
    aggregate.workspaceId === create.workspaceId &&
    aggregate.codingTaskId === prepared.codingTaskId &&
    aggregate.sourceTaskId === create.sourceTaskId &&
    aggregate.repositoryId === create.repositoryId &&
    aggregate.phase === CodingTaskPhase.Implementation &&
    aggregate.runState === CodingTaskRunState.Active &&
    aggregate.worktreeBinding.managed &&
    aggregate.worktreeBinding.worktreeId === create.worktreeBinding.worktreeId &&
    aggregate.worktreeBinding.relativePath === create.worktreeBinding.relativePath &&
    aggregate.executionAuthorization.planRisk.result === GateEvaluationResult.Allow &&
    (!aggregate.executionAuthorization.historicalLogicChange ||
      aggregate.executionAuthorization.businessLogic?.result === GateEvaluationResult.Allow) &&
    attempt !== undefined &&
    attempt.number === prepared.attemptNumber &&
    attempt.finishedAt === undefined &&
    attempt.outcome === undefined;
  return valid && attempt !== undefined
    ? success({ aggregate, attempt })
    : failure(
        new HarnessError(
          HarnessErrorCode.PreconditionNotMet,
          "CodingTask 权威状态不允许进入外部 Agent Session。",
          { stage: CodingTaskSessionActivationStage.AuthoritativeBinding },
        ),
      );
}

/** 校验既有 Activation Record 是否与本次启动输入属于同一 Session。 */
export function hasSameCodingTaskSessionActivationIdentity(
  record: CodingTaskSessionActivationRecord,
  prepared: PreparedCodingTaskSessionActivation,
): boolean {
  const create = prepared.createPayload;
  return (
    record.sessionId === prepared.manifest.sessionId &&
    record.workspaceId === create.workspaceId &&
    record.codingTaskId === prepared.codingTaskId &&
    record.sourceTaskId === create.sourceTaskId &&
    record.repositoryId === create.repositoryId &&
    record.attemptNumber === prepared.attemptNumber &&
    record.worktreeId === create.worktreeBinding.worktreeId &&
    record.worktreeRootDigest === prepared.worktreeRootDigest &&
    record.agentActorId === prepared.agentActorId
  );
}
