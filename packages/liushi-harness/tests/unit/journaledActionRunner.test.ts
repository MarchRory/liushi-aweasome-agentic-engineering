import { describe, expect, it } from "vitest";

import {
  ActionJournalMutationDisposition,
  JournaledActionDisposition,
  JournaledActionRunner,
  type ActionExecutorPort,
} from "../../src/application/index.js";
import {
  ActorKind,
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  parseContentDigest,
  failure,
  success,
} from "../../src/common/index.js";
import {
  ACTION_JOURNAL_SCHEMA_VERSION,
  ActionJournalRecordType,
  ActionJournalStatus,
  ActionKind,
  ActionOutcome,
  ActionResolution,
  appendActionObservation,
  appendActionResolution,
  createActionJournalState,
  parseActionId,
  type ActionIntentRecord,
  type ActionJournalState,
  type ActionObservationRecord,
  type ActionResolutionRecord,
} from "../../src/domain/actionJournal/index.js";
import { parseTaskId } from "../../src/domain/task/index.js";
import { parseWorkspaceId } from "../../src/domain/workspace/index.js";
import type {
  ActionJournalLocator,
  ActionJournalMutationOutput,
  ActionJournalRepository,
  TaskActionJournalLocator,
  ActionExecutionLockPort,
} from "../../src/application/ports/index.js";
import { FixedClock } from "../support/runtime/index.js";

const FIXED_TIME = "2026-07-12T00:00:00.000Z";

describe("JournaledActionRunner", () => {
  it("新 Intent 只执行一次，重复调用复用已完成状态", async () => {
    const repository = new MemoryActionJournalRepository();
    const runner = createRunner(repository);
    const intent = createIntent();
    let calls = 0;
    const executor = createExecutor(() => {
      calls += 1;
      return { outcome: ActionOutcome.Succeeded, evidenceIds: ["evidence-1"] };
    });

    const first = await runner.execute({ intent, executionInput: "input" }, executor);
    const duplicate = await runner.execute({ intent, executionInput: "input" }, executor);

    expect(first.status).toBe(ResultStatus.Success);
    expect(duplicate.status).toBe(ResultStatus.Success);
    if (first.status === ResultStatus.Success && duplicate.status === ResultStatus.Success) {
      expect(first.value.disposition).toBe(JournaledActionDisposition.Executed);
      expect(first.value.state.status).toBe(ActionJournalStatus.Committed);
      expect(duplicate.value.disposition).toBe(JournaledActionDisposition.ReusedCompleted);
    }
    expect(calls).toBe(1);
  });

  it("重复的 IntentRecorded 不自动重放 Executor", async () => {
    const intent = createIntent();
    const repository = new MemoryActionJournalRepository(createActionJournalState(intent));
    const runner = createRunner(repository);
    let calls = 0;
    const executor = createExecutor(() => {
      calls += 1;
      return { outcome: ActionOutcome.Succeeded, evidenceIds: [] };
    });

    const result = await runner.execute({ intent, executionInput: "input" }, executor);

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Success) {
      expect(result.value.disposition).toBe(JournaledActionDisposition.HumanRequired);
      expect(result.value.state.status).toBe(ActionJournalStatus.IntentRecorded);
    }
    expect(calls).toBe(0);
  });

  it("只有 RetryPermitted 允许再次执行", async () => {
    const intent = createIntent();
    const repository = new MemoryActionJournalRepository(createRetryPermittedState(intent));
    const runner = createRunner(repository);
    let calls = 0;
    const executor = createExecutor(() => {
      calls += 1;
      return { outcome: ActionOutcome.Succeeded, evidenceIds: ["retry-evidence"] };
    });

    const result = await runner.execute({ intent, executionInput: "input" }, executor);

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Success) {
      expect(result.value.state.status).toBe(ActionJournalStatus.Committed);
      expect(result.value.disposition).toBe(JournaledActionDisposition.Executed);
    }
    expect(calls).toBe(1);
  });

  it("AwaitingResolution 使用既有 Observation 闭合且不重放 Executor", async () => {
    const intent = createIntent();
    const repository = new MemoryActionJournalRepository(createAwaitingResolutionState(intent));
    const runner = createRunner(repository);
    let calls = 0;
    const executor = createExecutor(() => {
      calls += 1;
      return { outcome: ActionOutcome.Succeeded, evidenceIds: [] };
    });

    const result = await runner.execute({ intent, executionInput: "input" }, executor);

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Success) {
      expect(result.value.disposition).toBe(JournaledActionDisposition.RecoveredResolution);
      expect(result.value.state.status).toBe(ActionJournalStatus.Committed);
    }
    expect(calls).toBe(0);
  });

  it("Executor 抛出异常时闭合为 WaitingHuman", async () => {
    const repository = new MemoryActionJournalRepository();
    const runner = createRunner(repository);
    const executor: ActionExecutorPort<string> = {
      execute: () => Promise.reject(new Error("executor failed")),
    };

    const result = await runner.execute(
      { intent: createIntent(), executionInput: "input" },
      executor,
    );

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Success) {
      expect(result.value.disposition).toBe(JournaledActionDisposition.HumanRequired);
      expect(result.value.state.status).toBe(ActionJournalStatus.WaitingHuman);
      expect(result.value.state.observations[0]?.errorCode).toBe("executor_threw");
    }
  });

  it("NotApplied 明确进入 RetryPermitted", async () => {
    const repository = new MemoryActionJournalRepository();
    const runner = createRunner(repository);
    const executor = createExecutor(() => ({
      outcome: ActionOutcome.NotApplied,
      evidenceIds: ["not-applied-evidence"],
    }));

    const result = await runner.execute(
      { intent: createIntent(), executionInput: "input" },
      executor,
    );

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Success) {
      expect(result.value.disposition).toBe(JournaledActionDisposition.RetryPermitted);
      expect(result.value.state.status).toBe(ActionJournalStatus.RetryPermitted);
    }
  });

  it("Executor 已运行但 Observation 提交失败时返回 outcome unknown", async () => {
    const repository = new MemoryActionJournalRepository(undefined, true);
    const runner = createRunner(repository);
    let calls = 0;
    const executor = createExecutor(() => {
      calls += 1;
      return { outcome: ActionOutcome.Succeeded, evidenceIds: [] };
    });

    const result = await runner.execute(
      { intent: createIntent(), executionInput: "input" },
      executor,
    );

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Failure) {
      expect(result.error.code).toBe(HarnessErrorCode.ActionJournalCommitOutcomeUnknown);
      expect(result.error.details["phase"]).toBe("observation");
    }
    expect(calls).toBe(1);
  });
});

class MemoryActionJournalRepository implements ActionJournalRepository {
  public constructor(
    private state?: ActionJournalState,
    private readonly failObservation = false,
  ) {}

  public createIntent(
    intent: ActionIntentRecord,
  ): Promise<ReturnType<typeof success<ActionJournalMutationOutput>>> {
    if (this.state !== undefined) {
      return Promise.resolve(
        success({
          state: this.state,
          disposition: ActionJournalMutationDisposition.IdempotentReuse,
        }),
      );
    }
    this.state = createActionJournalState(intent);
    return Promise.resolve(
      success({ state: this.state, disposition: ActionJournalMutationDisposition.Appended }),
    );
  }

  public appendObservation(observation: ActionObservationRecord) {
    if (this.failObservation) {
      return Promise.resolve(
        failure(new HarnessError(HarnessErrorCode.IoFailure, "observation failed")),
      );
    }
    if (this.state === undefined) return Promise.resolve(failure(actionNotFound()));
    const appended = appendActionObservation(this.state, observation);
    if (appended.status === ResultStatus.Failure) return Promise.resolve(appended);
    this.state = appended.value;
    return Promise.resolve(
      success({ state: this.state, disposition: ActionJournalMutationDisposition.Appended }),
    );
  }

  public appendResolution(resolution: ActionResolutionRecord) {
    if (this.state === undefined) return Promise.resolve(failure(actionNotFound()));
    const appended = appendActionResolution(this.state, resolution);
    if (appended.status === ResultStatus.Failure) return Promise.resolve(appended);
    this.state = appended.value;
    return Promise.resolve(
      success({ state: this.state, disposition: ActionJournalMutationDisposition.Appended }),
    );
  }

  public load(locator: ActionJournalLocator) {
    void locator;
    return Promise.resolve(
      this.state === undefined ? failure(actionNotFound()) : success(this.state),
    );
  }

  public listRecoverable(locator: TaskActionJournalLocator) {
    void locator;
    return Promise.resolve(success(this.state === undefined ? [] : [this.state]));
  }
}

function createIntent(): ActionIntentRecord {
  return {
    schemaVersion: ACTION_JOURNAL_SCHEMA_VERSION,
    recordType: ActionJournalRecordType.Intent,
    actionId: must(parseActionId("01ARZ3NDEKTSV4RRFFQ69G5FAV")),
    sequence: 1,
    workspaceId: must(parseWorkspaceId("workspace-a")),
    taskId: must(parseTaskId("01ARZ3NDEKTSV4RRFFQ69G5FAW")),
    commandId: "command-1",
    correlationId: "correlation-1",
    idempotencyKey: "idempotency-1",
    kind: ActionKind.CommandExecution,
    target: "test-action",
    inputDigest: must(
      parseContentDigest("sha256:1111111111111111111111111111111111111111111111111111111111111111"),
    ),
    postconditionDigest: must(
      parseContentDigest("sha256:2222222222222222222222222222222222222222222222222222222222222222"),
    ),
    recoveryGuidance: "检查目标后置条件后由 Human 决定是否恢复。",
    actor: { kind: ActorKind.System, actorId: "journaled-action-test" },
    recordedAt: FIXED_TIME,
  };
}

function createRetryPermittedState(intent: ActionIntentRecord): ActionJournalState {
  const observed = createAwaitingResolutionState(intent, ActionOutcome.NotApplied);
  const resolved = appendActionResolution(observed, {
    schemaVersion: ACTION_JOURNAL_SCHEMA_VERSION,
    recordType: ActionJournalRecordType.Resolution,
    actionId: intent.actionId,
    workspaceId: intent.workspaceId,
    taskId: intent.taskId,
    sequence: 3,
    resolution: ActionResolution.RetryPermitted,
    reason: "测试允许重试。",
    actor: intent.actor,
    recordedAt: FIXED_TIME,
  });
  if (resolved.status === ResultStatus.Failure) throw resolved.error;
  return resolved.value;
}

function createAwaitingResolutionState(
  intent: ActionIntentRecord,
  outcome: ActionOutcome = ActionOutcome.Succeeded,
): ActionJournalState {
  const observed = appendActionObservation(createActionJournalState(intent), {
    schemaVersion: ACTION_JOURNAL_SCHEMA_VERSION,
    recordType: ActionJournalRecordType.Observation,
    actionId: intent.actionId,
    workspaceId: intent.workspaceId,
    taskId: intent.taskId,
    sequence: 2,
    outcome,
    evidenceIds: ["not-applied"],
    actor: intent.actor,
    recordedAt: FIXED_TIME,
  });
  if (observed.status === ResultStatus.Failure) throw observed.error;
  return observed.value;
}

function createExecutor(
  execute: () => {
    outcome: ActionOutcome;
    evidenceIds: readonly string[];
  },
): ActionExecutorPort<string> {
  return { execute: () => Promise.resolve(success(execute())) };
}

function createRunner(repository: ActionJournalRepository): JournaledActionRunner {
  const executionLock: ActionExecutionLockPort = {
    acquire: () => Promise.resolve(success({ release: () => Promise.resolve(success(undefined)) })),
  };
  return new JournaledActionRunner(repository, new FixedClock(FIXED_TIME), executionLock);
}

function must<T>(
  result: ReturnType<typeof success<T>> | ReturnType<typeof failure<HarnessError>>,
): T {
  if (result.status === ResultStatus.Failure) throw result.error;
  return result.value;
}

function actionNotFound(): HarnessError {
  return new HarnessError(HarnessErrorCode.ActionNotFound, "action not found");
}
