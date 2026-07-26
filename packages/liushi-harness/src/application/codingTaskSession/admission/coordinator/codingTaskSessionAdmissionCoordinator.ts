import {
  createActionResolution,
  type SessionActionHookHandlerInput,
  type SessionActionHookHandlerPort,
  type SessionActionHookHandlerSuccess,
  type SessionPostActionHookPayload,
  type SessionPreActionHookPayload,
} from "#application/hooks/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import {
  CodingTaskSessionAdmissionStatus,
  beginPending,
  commitPending,
  parseCodingTaskSessionId,
  type CodingTaskSessionAdmissionState,
} from "#domain/codingTaskSession/index.js";

import type {
  CodingTaskSessionAdmissionCoordinatorDependencies,
  CodingTaskSessionBeginClosingInput,
  CodingTaskSessionBeginClosingResult,
} from "../contracts/index.js";
import { closeCodingTaskSessionAdmission } from "../closing/index.js";
import { loadSessionActionAdmissionContext } from "../context/index.js";
import {
  createSessionActionIntent,
  createSessionActionObservation,
  createSessionActionTraceEvidence,
} from "../factory/index.js";
import { validateSessionPostActionIntent } from "../validation/index.js";
import {
  createSessionActionLocator,
  isHealthyActionMutation,
  isNewHealthyActionMutation,
  recordSessionActionTraceSafely,
  sessionActionVersionConflict,
  unexpectedSessionAdmissionFailure,
  withSessionAdmissionOperationFailure,
} from "./sessionActionAdmissionCoordinatorUtils.js";
import {
  persistSessionAdmissionOutcomeUnknown,
  reconcileSessionAdmissionOutcomeUnknown,
} from "./sessionAdmissionOutcomeUnknown.js";

/** 在单一 Session Lease 下协调 Hook、Admission State 与 Action Journal。 */
export class CodingTaskSessionAdmissionCoordinator implements SessionActionHookHandlerPort {
  public constructor(
    private readonly dependencies: CodingTaskSessionAdmissionCoordinatorDependencies,
  ) {}

  /** 在 Action Intent 达到健康持久化且 State 已提交后才允许宿主继续。 */
  public async admitPreAction(
    input: SessionActionHookHandlerInput<SessionPreActionHookPayload>,
  ): Promise<Result<SessionActionHookHandlerSuccess, HarnessError>> {
    return this.withLease(input.payload, () => this.admitPreActionLocked(input));
  }

  /** 复验已准入 Intent，先记录 Trace，再闭合 Observation 与 Resolution。 */
  public async recordPostAction(
    input: SessionActionHookHandlerInput<SessionPostActionHookPayload>,
  ): Promise<Result<SessionActionHookHandlerSuccess, HarnessError>> {
    return this.withLease(input.payload, () => this.recordPostActionLocked(input));
  }

  /** 在没有 Pending 或缺失 Post 的 Action 时原子阻断后续 PreAction。 */
  public async beginClosing(
    input: CodingTaskSessionBeginClosingInput,
  ): Promise<Result<CodingTaskSessionBeginClosingResult, HarnessError>> {
    const acquired = await this.dependencies.admissionLease.acquire(input);
    if (acquired.status === ResultStatus.Failure) return acquired;
    let result: Result<CodingTaskSessionBeginClosingResult, HarnessError>;
    try {
      result = await this.beginClosingLocked(input);
    } catch (error) {
      result = failure(unexpectedSessionAdmissionFailure("Session Admission 关闭失败。", error));
    }
    const released = await acquired.value.release();
    return released.status === ResultStatus.Failure
      ? failure(withSessionAdmissionOperationFailure(released.error, result))
      : result;
  }

  private async admitPreActionLocked(
    input: SessionActionHookHandlerInput<SessionPreActionHookPayload>,
  ): Promise<Result<SessionActionHookHandlerSuccess, HarnessError>> {
    if (input.expectedVersion !== 0) return sessionActionVersionConflict(0, input.expectedVersion);
    const context = await loadSessionActionAdmissionContext(
      this.dependencies,
      input.payload,
      input.invocationProvenance,
    );
    if (context.status === ResultStatus.Failure) return context;
    const authorized = await this.dependencies.authorization.authorize(input.payload);
    if (authorized.status === ResultStatus.Failure) return authorized;
    const intent = createSessionActionIntent(input.payload, context.value.provenance);
    if (intent.status === ResultStatus.Failure) return intent;
    const intentDigest = this.dependencies.digest.calculate(intent.value);
    if (intentDigest.status === ResultStatus.Failure) return intentDigest;
    const pendingInput = {
      actionId: input.payload.actionId,
      intentDigest: intentDigest.value,
      executorSessionIdDigest: context.value.provenance.executorSessionIdDigest,
      updatedAt: input.payload.occurredAt,
    };
    const pending = beginPending(context.value.state, pendingInput);
    if (pending.status === ResultStatus.Failure) return pending;
    const persistedPending = await this.dependencies.stateStore.replace({
      expectedVersion: context.value.state.version,
      state: pending.value,
    });
    if (persistedPending.status === ResultStatus.Failure) {
      return reconcileSessionAdmissionOutcomeUnknown(
        this.dependencies.stateStore,
        [context.value.state, pending.value],
        input.payload.occurredAt,
        persistedPending.error,
        "Admission Pending 提交结果未知，Session 已停止自动 Admission。",
      );
    }

    const recorded = await this.dependencies.actionJournal.createIntent(intent.value);
    if (recorded.status === ResultStatus.Failure) {
      return this.markUnknownAfterIntentAttempt(persistedPending.value, recorded.error);
    }
    if (!isNewHealthyActionMutation(recorded.value)) {
      return this.markUnknownAfterIntentAttempt(
        persistedPending.value,
        new HarnessError(
          HarnessErrorCode.ActionJournalCommitOutcomeUnknown,
          "Session Action Intent 未形成唯一且健康的新提交。",
        ),
      );
    }

    const committed = commitPending(persistedPending.value, pendingInput);
    if (committed.status === ResultStatus.Failure) {
      return persistSessionAdmissionOutcomeUnknown(
        this.dependencies.stateStore,
        persistedPending.value,
        input.payload.occurredAt,
        committed.error,
        "Action Intent 已提交但 Admission State 无法完成迁移。",
      );
    }
    const persisted = await this.dependencies.stateStore.replace({
      expectedVersion: persistedPending.value.version,
      state: committed.value,
    });
    if (persisted.status === ResultStatus.Failure) {
      return reconcileSessionAdmissionOutcomeUnknown(
        this.dependencies.stateStore,
        [persistedPending.value, committed.value],
        input.payload.occurredAt,
        persisted.error,
        "Action Intent 已提交但 Admission State 提交结果未知。",
      );
    }
    return success({ committedVersion: recorded.value.state.lastSequence });
  }

  private async recordPostActionLocked(
    input: SessionActionHookHandlerInput<SessionPostActionHookPayload>,
  ): Promise<Result<SessionActionHookHandlerSuccess, HarnessError>> {
    const context = await loadSessionActionAdmissionContext(
      this.dependencies,
      input.payload,
      input.invocationProvenance,
    );
    if (context.status === ResultStatus.Failure) return context;
    if (
      ![
        CodingTaskSessionAdmissionStatus.WaitingAgent,
        CodingTaskSessionAdmissionStatus.Closing,
      ].includes(context.value.state.status) ||
      context.value.state.pendingAdmission !== null ||
      !context.value.state.admittedActionIds.includes(input.payload.actionId)
    ) {
      return failure(
        new HarnessError(
          HarnessErrorCode.OperationForbidden,
          "Session PostAction 没有对应的已准入 Action，或 Admission State 不允许闭合。",
        ),
      );
    }
    const loaded = await this.dependencies.actionJournal.load(
      createSessionActionLocator(input.payload),
    );
    if (loaded.status === ResultStatus.Failure) return loaded;
    if (loaded.value.lastSequence !== input.expectedVersion) {
      return sessionActionVersionConflict(loaded.value.lastSequence, input.expectedVersion);
    }
    const intent = validateSessionPostActionIntent(
      input.payload,
      input.invocationProvenance,
      loaded.value,
      context.value.provenance,
      this.dependencies.digest,
    );
    if (intent.status === ResultStatus.Failure) return intent;

    const traceOutcome = await recordSessionActionTraceSafely(
      this.dependencies.traceStore,
      input.payload,
    );
    const trace = createSessionActionTraceEvidence(traceOutcome, this.dependencies.digest);
    if (trace.status === ResultStatus.Failure) return trace;
    const observation = createSessionActionObservation(
      input.payload,
      intent.value,
      loaded.value.lastSequence + 1,
      trace.value,
    );
    if (observation.status === ResultStatus.Failure) return observation;
    const observed = await this.dependencies.actionJournal.appendObservation(observation.value);
    if (observed.status === ResultStatus.Failure || !isHealthyActionMutation(observed.value)) {
      return persistSessionAdmissionOutcomeUnknown(
        this.dependencies.stateStore,
        context.value.state,
        input.payload.occurredAt,
        observed.status === ResultStatus.Failure
          ? observed.error
          : new HarnessError(
              HarnessErrorCode.ActionJournalCommitOutcomeUnknown,
              "Observation 持久化降级。",
            ),
        "Session PostAction Observation 提交结果未知。",
      );
    }
    const resolved = await this.dependencies.actionJournal.appendResolution(
      createActionResolution(input.payload, observed.value.state.lastSequence + 1),
    );
    if (resolved.status === ResultStatus.Failure || !isHealthyActionMutation(resolved.value)) {
      return persistSessionAdmissionOutcomeUnknown(
        this.dependencies.stateStore,
        context.value.state,
        input.payload.occurredAt,
        resolved.status === ResultStatus.Failure
          ? resolved.error
          : new HarnessError(
              HarnessErrorCode.ActionJournalCommitOutcomeUnknown,
              "Resolution 持久化降级。",
            ),
        "Session PostAction Resolution 提交结果未知。",
      );
    }
    return success({ committedVersion: resolved.value.state.lastSequence });
  }

  private async beginClosingLocked(
    input: CodingTaskSessionBeginClosingInput,
  ): Promise<Result<CodingTaskSessionBeginClosingResult, HarnessError>> {
    return closeCodingTaskSessionAdmission(this.dependencies, input);
  }

  private async withLease<T>(
    payload: SessionPreActionHookPayload | SessionPostActionHookPayload,
    operation: () => Promise<Result<T, HarnessError>>,
  ): Promise<Result<T, HarnessError>> {
    const sessionId = parseCodingTaskSessionId(payload.sessionContext.sessionId);
    if (sessionId.status === ResultStatus.Failure) return sessionId;
    const lease = await this.dependencies.admissionLease.acquire({
      workspaceId: payload.workspaceId,
      sessionId: sessionId.value,
    });
    if (lease.status === ResultStatus.Failure) return lease;
    let result: Result<T, HarnessError>;
    try {
      result = await operation();
    } catch (error) {
      result = failure(
        unexpectedSessionAdmissionFailure("Session Action Admission 执行失败。", error),
      );
    }
    const released = await lease.value.release();
    return released.status === ResultStatus.Failure
      ? failure(withSessionAdmissionOperationFailure(released.error, result))
      : result;
  }

  private async markUnknownAfterIntentAttempt(
    pendingState: CodingTaskSessionAdmissionState,
    cause: HarnessError,
  ): Promise<Result<never, HarnessError>> {
    return persistSessionAdmissionOutcomeUnknown(
      this.dependencies.stateStore,
      pendingState,
      pendingState.updatedAt,
      cause,
      "Action Intent 提交未形成可安全放行的结果，Session 已停止自动 Admission。",
    );
  }
}
