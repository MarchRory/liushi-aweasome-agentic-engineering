import { codingTaskVersionConflict } from "#application/codingTask/index.js";
import type { CommandEnvelope } from "#application/command/index.js";
import type { CommandHandlerSuccess } from "#application/commandGateway/index.js";
import {
  WorktreeProvisionRecoveryInspectionStatus,
  type ActionExecutionLockPort,
  type ActionJournalRepository,
  type CodingTaskRepository,
  type ContentDigestPort,
  type RepositoryLockPort,
} from "#application/ports/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Clock,
  type Result,
} from "#common/index.js";
import { ActionJournalStatus, type ActionJournalState } from "#domain/actionJournal/index.js";
import { parseCodingTaskId } from "#domain/codingTask/index.js";

import type { WorktreeProvisionRecoveryAssessmentService } from "../assessment/index.js";
import type { ReconcileWorktreeProvisionCommandPayload } from "../contracts/index.js";
import {
  worktreeProvisionRecoveryAssessmentConflict,
  worktreeProvisionRecoveryJournalUnknown,
} from "../errors/index.js";
import { WorktreeProvisionRecoveryJournalPhase } from "../enums/index.js";
import {
  createExistingProvisionResolution,
  createProvisionRecoveryObservation,
  createProvisionRecoveryResolution,
} from "../factory/index.js";
import {
  validateReconcileWorktreeProvisionEnvelope,
  type ValidatedReconcileWorktreeProvisionPayload,
  type ValidatedWorktreeProvisionRecoveryLocator,
} from "../validation/index.js";

/** 在双锁和 Human 摘要绑定内闭合未知 Worktree Provision Action。 */
export class WorktreeProvisionRecoveryCommandHandler {
  public constructor(
    private readonly codingTaskRepository: CodingTaskRepository,
    private readonly actionJournalRepository: ActionJournalRepository,
    private readonly repositoryLock: RepositoryLockPort,
    private readonly actionExecutionLock: ActionExecutionLockPort,
    private readonly assessmentService: WorktreeProvisionRecoveryAssessmentService,
    private readonly digest: ContentDigestPort,
    private readonly clock: Clock,
  ) {}

  /** 执行已由 Application Command Gateway 预留的 Human 恢复命令。 */
  public async execute(
    command: CommandEnvelope<ReconcileWorktreeProvisionCommandPayload>,
  ): Promise<Result<CommandHandlerSuccess, HarnessError>> {
    const envelope = validateReconcileWorktreeProvisionEnvelope(this.digest, command);
    if (envelope.status === ResultStatus.Failure) return envelope;
    const codingTaskId = parseCodingTaskId(command.aggregateId);
    if (codingTaskId.status === ResultStatus.Failure) return codingTaskId;
    const locator = {
      workspaceId: envelope.value.workspaceId,
      codingTaskId: codingTaskId.value,
      actionId: envelope.value.actionId,
    };
    const loaded = await this.codingTaskRepository.load(locator);
    if (loaded.status === ResultStatus.Failure) return loaded;
    if (loaded.value.aggregate.version !== command.expectedVersion) {
      return failure(
        codingTaskVersionConflict(command.expectedVersion, loaded.value.aggregate.version),
      );
    }
    const repositoryLock = await this.repositoryLock.acquire({
      workspaceId: loaded.value.aggregate.workspaceId,
      repositoryId: loaded.value.aggregate.repositoryId,
      holderId: loaded.value.aggregate.codingTaskId,
    });
    if (repositoryLock.status === ResultStatus.Failure) return repositoryLock;
    const actionLock = await this.actionExecutionLock.acquire({
      workspaceId: loaded.value.aggregate.workspaceId,
      taskId: loaded.value.aggregate.sourceTaskId,
      actionId: envelope.value.actionId,
    });
    if (actionLock.status === ResultStatus.Failure) {
      const released = await repositoryLock.value.release();
      return released.status === ResultStatus.Failure ? released : actionLock;
    }
    let result: Result<CommandHandlerSuccess, HarnessError>;
    try {
      result = await this.runLocked(command, envelope.value, locator);
    } catch (error) {
      result = failure(
        new HarnessError(
          HarnessErrorCode.IoFailure,
          "Worktree Provision 恢复对账发生未捕获错误。",
          { actionId: envelope.value.actionId },
          error,
        ),
      );
    }
    const actionReleased = await actionLock.value.release();
    const repositoryReleased = await repositoryLock.value.release();
    if (actionReleased.status === ResultStatus.Failure) return actionReleased;
    return repositoryReleased.status === ResultStatus.Failure ? repositoryReleased : result;
  }

  private async runLocked(
    command: CommandEnvelope,
    payload: ValidatedReconcileWorktreeProvisionPayload,
    locator: ValidatedWorktreeProvisionRecoveryLocator,
  ): Promise<Result<CommandHandlerSuccess, HarnessError>> {
    const assessed = await this.assessmentService.assess(locator);
    if (assessed.status === ResultStatus.Failure) return assessed;
    const { assessment, aggregate } = assessed.value;
    if (aggregate.version !== command.expectedVersion) {
      return failure(codingTaskVersionConflict(command.expectedVersion, aggregate.version));
    }
    if (assessment.digest !== payload.expectedAssessmentDigest) {
      return failure(
        worktreeProvisionRecoveryAssessmentConflict(
          payload.expectedAssessmentDigest,
          assessment.digest,
        ),
      );
    }
    let state = assessed.value.journal;
    if (state.status === ActionJournalStatus.AwaitingResolution) {
      const completed = await this.completeExistingResolution(state, command);
      if (completed.status === ResultStatus.Failure) return completed;
      state = completed.value;
      if (state.status === ActionJournalStatus.Recovered) {
        return success({ committedVersion: aggregate.version });
      }
      if (
        state.status === ActionJournalStatus.RetryPermitted &&
        assessment.status === WorktreeProvisionRecoveryInspectionStatus.NotApplied
      ) {
        return success({ committedVersion: aggregate.version });
      }
    }
    return this.recordAssessment(state, assessment, command, aggregate.version);
  }

  private async completeExistingResolution(
    state: ActionJournalState,
    command: CommandEnvelope,
  ): Promise<Result<ActionJournalState, HarnessError>> {
    const record = createExistingProvisionResolution(state, command.actor, this.clock);
    if (record === undefined) {
      return failure(
        new HarnessError(HarnessErrorCode.CorruptStore, "等待处置的 Action 缺少 Observation。", {
          actionId: state.intent.actionId,
        }),
      );
    }
    const appended = await this.actionJournalRepository.appendResolution(record);
    return appended.status === ResultStatus.Failure
      ? failure(
          worktreeProvisionRecoveryJournalUnknown(
            state.intent.actionId,
            WorktreeProvisionRecoveryJournalPhase.ExistingResolution,
            appended.error,
          ),
        )
      : success(appended.value.state);
  }

  private async recordAssessment(
    state: ActionJournalState,
    assessment: Parameters<typeof createProvisionRecoveryObservation>[1],
    command: CommandEnvelope,
    aggregateVersion: number,
  ): Promise<Result<CommandHandlerSuccess, HarnessError>> {
    const observation = await this.actionJournalRepository.appendObservation(
      createProvisionRecoveryObservation(state, assessment, command.actor, this.clock),
    );
    if (observation.status === ResultStatus.Failure) {
      return failure(
        worktreeProvisionRecoveryJournalUnknown(
          state.intent.actionId,
          WorktreeProvisionRecoveryJournalPhase.RecoveryObservation,
          observation.error,
        ),
      );
    }
    const resolution = await this.actionJournalRepository.appendResolution(
      createProvisionRecoveryResolution(
        observation.value.state,
        assessment,
        command.actor,
        this.clock,
      ),
    );
    if (resolution.status === ResultStatus.Failure) {
      return failure(
        worktreeProvisionRecoveryJournalUnknown(
          state.intent.actionId,
          WorktreeProvisionRecoveryJournalPhase.RecoveryResolution,
          resolution.error,
        ),
      );
    }
    return success({ committedVersion: aggregateVersion });
  }
}
