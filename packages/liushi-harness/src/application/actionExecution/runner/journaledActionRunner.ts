import {
  ActionJournalMutationDisposition,
  type ActionExecutionLockPort,
  type ActionJournalRepository,
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
import {
  ActionJournalStatus,
  ActionOutcome,
  type ActionJournalState,
} from "#domain/actionJournal/index.js";

import { JOURNALED_ACTION_EXECUTOR_THROWN_ERROR_CODE } from "../constants/index.js";
import type {
  ActionExecutionResult,
  ActionExecutorPort,
  JournaledActionRunInput,
  JournaledActionRunOutput,
} from "../contracts/index.js";
import { JournaledActionDisposition, JournaledActionPersistencePhase } from "../enums/index.js";
import { createExecutionObservation, createExecutionResolution } from "../factory/index.js";

/** 以 Intent -> Execute -> Observation -> Resolution 顺序闭合副作用。 */
export class JournaledActionRunner {
  public constructor(
    private readonly repository: ActionJournalRepository,
    private readonly clock: Clock,
    private readonly executionLock: ActionExecutionLockPort,
  ) {}

  /** 仅在新 Intent 或明确 RetryPermitted 时调用 Executor。 */
  public async execute<TInput>(
    input: JournaledActionRunInput<TInput>,
    executor: ActionExecutorPort<TInput>,
  ): Promise<Result<JournaledActionRunOutput, HarnessError>> {
    const lock = await this.executionLock.acquire({
      workspaceId: input.intent.workspaceId,
      taskId: input.intent.taskId,
      actionId: input.intent.actionId,
    });
    if (lock.status === ResultStatus.Failure) return lock;

    let result: Result<JournaledActionRunOutput, HarnessError>;
    try {
      result = await this.executeLocked(input, executor);
    } catch (error) {
      result = failure(
        new HarnessError(
          HarnessErrorCode.IoFailure,
          "Journaled Action execution failed unexpectedly.",
          { actionId: input.intent.actionId },
          error,
        ),
      );
    }
    const released = await lock.value.release();
    return released.status === ResultStatus.Failure ? released : result;
  }

  private async executeLocked<TInput>(
    input: JournaledActionRunInput<TInput>,
    executor: ActionExecutorPort<TInput>,
  ): Promise<Result<JournaledActionRunOutput, HarnessError>> {
    const intent = await this.repository.createIntent(input.intent);
    if (intent.status === ResultStatus.Failure) return intent;
    if (
      intent.value.disposition === ActionJournalMutationDisposition.Appended &&
      intent.value.state.status !== ActionJournalStatus.IntentRecorded
    ) {
      return failure(corruptState(intent.value.state));
    }

    const resumed = await this.resumeExisting(intent.value.disposition, intent.value.state);
    if (resumed !== undefined) return resumed;

    const execution = await executeSafely(executor, input.executionInput);
    const observed = await this.repository.appendObservation(
      createExecutionObservation(
        input.intent,
        intent.value.state.lastSequence + 1,
        execution,
        this.clock,
      ),
    );
    if (observed.status === ResultStatus.Failure) {
      return failure(
        commitUnknown(
          input.intent.actionId,
          JournaledActionPersistencePhase.Observation,
          observed.error,
        ),
      );
    }

    const resolved = await this.repository.appendResolution(
      createExecutionResolution(
        input.intent,
        observed.value.state.lastSequence + 1,
        execution.outcome,
        this.clock,
      ),
    );
    if (resolved.status === ResultStatus.Failure) {
      return failure(
        commitUnknown(
          input.intent.actionId,
          JournaledActionPersistencePhase.Resolution,
          resolved.error,
        ),
      );
    }
    const disposition = dispositionFromState(resolved.value.state);
    if (disposition === undefined) return failure(corruptState(resolved.value.state));
    return success({
      state: resolved.value.state,
      disposition,
    });
  }

  private async resumeExisting(
    disposition: ActionJournalMutationDisposition,
    state: ActionJournalState,
  ): Promise<Result<JournaledActionRunOutput, HarnessError> | undefined> {
    if (disposition === ActionJournalMutationDisposition.Appended) return undefined;
    switch (state.status) {
      case ActionJournalStatus.Committed:
      case ActionJournalStatus.Recovered:
        return success({ state, disposition: JournaledActionDisposition.ReusedCompleted });
      case ActionJournalStatus.RetryPermitted:
        return undefined;
      case ActionJournalStatus.AwaitingResolution:
        return this.completeExistingObservation(state);
      case ActionJournalStatus.IntentRecorded:
      case ActionJournalStatus.WaitingHuman:
        return success({ state, disposition: JournaledActionDisposition.HumanRequired });
    }
  }

  private async completeExistingObservation(
    state: ActionJournalState,
  ): Promise<Result<JournaledActionRunOutput, HarnessError>> {
    const latest = state.observations.at(-1);
    if (latest === undefined) return failure(corruptState(state));
    const resolved = await this.repository.appendResolution(
      createExecutionResolution(state.intent, state.lastSequence + 1, latest.outcome, this.clock),
    );
    if (resolved.status === ResultStatus.Failure) {
      return failure(
        commitUnknown(
          state.intent.actionId,
          JournaledActionPersistencePhase.Resolution,
          resolved.error,
        ),
      );
    }
    const finalDisposition = dispositionFromRecoveredState(resolved.value.state);
    return finalDisposition === undefined
      ? failure(corruptState(resolved.value.state))
      : success({ state: resolved.value.state, disposition: finalDisposition });
  }
}

async function executeSafely<TInput>(
  executor: ActionExecutorPort<TInput>,
  input: TInput,
): Promise<ActionExecutionResult> {
  try {
    const result = await executor.execute(input);
    return result.status === ResultStatus.Success
      ? result.value
      : {
          outcome: ActionOutcome.OutcomeUnknown,
          evidenceIds: [],
          errorCode: result.error.code,
        };
  } catch {
    return {
      outcome: ActionOutcome.OutcomeUnknown,
      evidenceIds: [],
      errorCode: JOURNALED_ACTION_EXECUTOR_THROWN_ERROR_CODE,
    };
  }
}

function dispositionFromRecoveredState(
  state: ActionJournalState,
): JournaledActionDisposition | undefined {
  switch (state.status) {
    case ActionJournalStatus.Committed:
    case ActionJournalStatus.Recovered:
      return JournaledActionDisposition.RecoveredResolution;
    case ActionJournalStatus.RetryPermitted:
      return JournaledActionDisposition.RetryPermitted;
    case ActionJournalStatus.WaitingHuman:
      return JournaledActionDisposition.HumanRequired;
    case ActionJournalStatus.IntentRecorded:
    case ActionJournalStatus.AwaitingResolution:
      return undefined;
  }
}

function dispositionFromState(state: ActionJournalState): JournaledActionDisposition | undefined {
  switch (state.status) {
    case ActionJournalStatus.Committed:
    case ActionJournalStatus.Recovered:
      return JournaledActionDisposition.Executed;
    case ActionJournalStatus.RetryPermitted:
      return JournaledActionDisposition.RetryPermitted;
    case ActionJournalStatus.WaitingHuman:
      return JournaledActionDisposition.HumanRequired;
    case ActionJournalStatus.IntentRecorded:
    case ActionJournalStatus.AwaitingResolution:
      return undefined;
  }
}

function corruptState(state: ActionJournalState): HarnessError {
  return new HarnessError(
    HarnessErrorCode.CorruptStore,
    "Action Journal Repository 返回了不兼容的状态。",
    { actionId: state.intent.actionId, status: state.status },
  );
}

function commitUnknown(
  actionId: string,
  phase: JournaledActionPersistencePhase,
  cause: HarnessError,
): HarnessError {
  return new HarnessError(
    HarnessErrorCode.ActionJournalCommitOutcomeUnknown,
    "Action 已执行但 Action Journal 无法可靠闭合，禁止自动重试。",
    { actionId, phase },
    cause,
  );
}
