import type { ArtifactDigestPort, TaskRepository } from "#application/ports/index.js";
import type { HarnessError } from "#common/index.js";
import {
  HarnessErrorCode,
  ResultStatus,
  success,
  type Clock,
  type Delay,
  type IdGenerator,
  type Result,
} from "#common/index.js";
import type { ApprovalRecord } from "#domain/approval/index.js";
import { evaluateArtifactGate } from "#domain/gate/index.js";
import { parseTaskId } from "#domain/task/index.js";
import { TaskRunEventType, type TaskAggregateRecord } from "#domain/taskRun/index.js";
import { parseWorkspaceId } from "#domain/workspace/index.js";

import {
  findApprovalByIdempotencyKey,
  resolveApprovalTarget,
  validateApprovalReuse,
} from "./approvalAttemptPolicy.js";
import { createApprovalRecord } from "./approvalRecordFactory.js";
import { parseApprovalSubmission, type ApprovalSubmission } from "./approvalSubmission.js";
import { ApprovalRecordDisposition } from "./recordApproval.enums.js";
import type { RecordApprovalInput } from "./recordApproval.input.js";
import type { RecordApprovalOutput } from "./recordApproval.output.js";
import {
  APPROVAL_CONFLICT_RESOLUTION_ATTEMPTS,
  APPROVAL_CONFLICT_RESOLUTION_DELAY_MS,
} from "./recordApproval.constants.js";

/** 校验 Human 决策、重算 Gate 并提交 ApprovalRecorded Event。 */
export class RecordApprovalUseCase {
  public constructor(
    private readonly repository: TaskRepository,
    private readonly digestPort: ArtifactDigestPort,
    private readonly clock: Clock,
    private readonly approvalIdGenerator: IdGenerator,
    private readonly delay: Delay,
  ) {}

  /** 执行一次具备精确绑定和并发幂等语义的 Human Approval 协议。 */
  public async execute(
    input: RecordApprovalInput,
  ): Promise<Result<RecordApprovalOutput, HarnessError>> {
    const workspaceId = parseWorkspaceId(input.workspaceId);
    if (workspaceId.status === ResultStatus.Failure) {
      return workspaceId;
    }
    const taskId = parseTaskId(input.taskId);
    if (taskId.status === ResultStatus.Failure) {
      return taskId;
    }
    const submission = parseApprovalSubmission(input);
    if (submission.status === ResultStatus.Failure) {
      return submission;
    }

    const locator = { workspaceId: workspaceId.value, taskId: taskId.value };
    return this.executeWithConflictRecovery(
      locator,
      submission.value,
      APPROVAL_CONFLICT_RESOLUTION_ATTEMPTS,
    );
  }

  private async executeWithConflictRecovery(
    locator: Parameters<TaskRepository["load"]>[0],
    submission: ApprovalSubmission,
    remainingAttempts: number,
  ): Promise<Result<RecordApprovalOutput, HarnessError>> {
    const loaded = await this.repository.load(locator);
    if (loaded.status === ResultStatus.Failure) {
      return this.retryConflict(locator, submission, loaded.error, remainingAttempts);
    }
    const reused = this.reuseExistingApproval(loaded.value, submission);
    if (reused !== undefined) {
      return reused;
    }
    const target = resolveApprovalTarget(loaded.value.aggregate, submission);
    if (target.status === ResultStatus.Failure) {
      return target;
    }

    const occurredAt = this.clock.now().toISOString();
    const approval = createApprovalRecord(
      target.value.decisionRequest,
      submission,
      occurredAt,
      this.approvalIdGenerator,
      this.digestPort,
    );
    if (approval.status === ResultStatus.Failure) {
      return approval;
    }
    const gateEvaluation = evaluateArtifactGate(
      target.value.artifact,
      [...loaded.value.aggregate.approvals, approval.value],
      occurredAt,
    );
    const appended = await this.repository.append({
      locator,
      expectedLastSequence: loaded.value.lastSequence,
      expectedLastEventHash: loaded.value.lastEventHash,
      occurredAt,
      actor: submission.actor,
      type: TaskRunEventType.ApprovalRecorded,
      payload: { approval: approval.value, gateEvaluation },
    });
    if (appended.status === ResultStatus.Failure) {
      return this.retryConflict(locator, submission, appended.error, remainingAttempts);
    }

    return success({
      approval: approval.value,
      gateEvaluation,
      task: appended.value.record.aggregate.task,
      disposition: ApprovalRecordDisposition.Recorded,
      persistence: appended.value.persistence,
    });
  }

  private reuseExistingApproval(
    record: TaskAggregateRecord,
    submission: ApprovalSubmission,
  ): Result<RecordApprovalOutput, HarnessError> | undefined {
    const approval = findApprovalByIdempotencyKey(record.aggregate, submission.idempotencyKey);
    if (approval === undefined) {
      return undefined;
    }
    const artifact = validateApprovalReuse(record.aggregate, approval, submission);
    return artifact.status === ResultStatus.Failure
      ? artifact
      : success(this.createReusedOutput(record, approval, artifact.value));
  }

  private async retryConflict(
    locator: Parameters<TaskRepository["load"]>[0],
    submission: ApprovalSubmission,
    conflict: HarnessError,
    remainingAttempts: number,
  ): Promise<Result<RecordApprovalOutput, HarnessError>> {
    if (
      ![HarnessErrorCode.LockUnavailable, HarnessErrorCode.VersionConflict].includes(
        conflict.code,
      ) ||
      remainingAttempts <= 0
    ) {
      return { status: ResultStatus.Failure, error: conflict };
    }
    await this.delay.wait(APPROVAL_CONFLICT_RESOLUTION_DELAY_MS);
    return this.executeWithConflictRecovery(locator, submission, remainingAttempts - 1);
  }

  private createReusedOutput(
    record: TaskAggregateRecord,
    approval: ApprovalRecord,
    artifact: Parameters<typeof evaluateArtifactGate>[0],
  ): RecordApprovalOutput {
    return {
      approval,
      gateEvaluation: evaluateArtifactGate(
        artifact,
        record.aggregate.approvals,
        approval.createdAt,
      ),
      task: record.aggregate.task,
      disposition: ApprovalRecordDisposition.Reused,
    };
  }
}
