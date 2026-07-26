import { describe, expect, it } from "vitest";

import {
  CodingTaskSessionAdmissionCoordinator,
  CodingTaskSessionActivationDisposition,
  createSessionHookBinding,
  type CodingTaskSessionAdmissionCoordinatorDependencies,
  type HookBinding,
  type HookWorkspaceBinding,
  type SessionHookBinding,
  type SessionPostActionHookPayload,
  type SessionPreActionHookPayload,
} from "#application/index.js";
import {
  ActionJournalMutationDisposition,
  CodingTaskSessionAdmissionStateCreateDisposition,
  LockReleaseStatus,
  ParentDirectorySyncStatus,
  PersistenceHealth,
  type ActionJournalMutationOutput,
  type ActionJournalRepository,
  type CodingTaskSessionAdmissionLease,
  type CodingTaskSessionAdmissionStateStore,
  type CodingTaskSessionActivationRepository,
  type ContentDigestPort,
  type HookBindingStore,
  type TraceObservationStore,
} from "#application/ports/index.js";
import {
  COMMAND_INVOCATION_PROVENANCE_SCHEMA_VERSION,
  type CommandInvocationProvenance,
} from "#application/command/index.js";
import {
  CANONICAL_SESSION_HOOK_SCHEMA_VERSION,
  HarnessHookEvent,
  HookExecutorKind,
} from "#application/hooks/index.js";
import {
  TraceDropReason,
  type TraceSpanObservation,
  TraceWriteDisposition,
  parseSpanId,
  parseTraceId,
} from "#application/observability/index.js";
import {
  ActionKind,
  ActionJournalRecordType,
  ActionJournalSchemaVersion,
  ActionJournalStatus,
  ActionOutcome,
  SessionActionTraceDisposition,
  SessionActionTraceDropReason,
  type ActionJournalState,
} from "#domain/actionJournal/index.js";
import {
  CODING_TASK_SESSION_ACTIVATION_SCHEMA_VERSION,
  CodingTaskSessionAdmissionStatus,
  createCodingTaskSessionActivationRecord,
  createCodingTaskSessionAdmissionState,
  parseCodingTaskSessionId,
  type CodingTaskSessionActivationRecord,
  type CodingTaskSessionAdmissionState,
} from "#domain/codingTaskSession/index.js";
import { parseActionId } from "#domain/actionJournal/index.js";
import { parseArtifactDigest, parseArtifactId } from "#domain/artifact/index.js";
import { parseCodingTaskId } from "#domain/codingTask/index.js";
import { parseTaskId } from "#domain/task/index.js";
import { parseRepositoryId, parseWorkspaceId } from "#domain/workspace/index.js";
import {
  ActorKind,
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  parseContentDigest,
  success,
  failure,
  type ActorRef,
  type ContentDigest,
  type HarnessError as HarnessErrorType,
  type Result,
} from "#common/index.js";
import { Rfc8785Sha256DigestAdapter } from "#infrastructure/serialization/jsonDigest/index.js";

const digest = new Rfc8785Sha256DigestAdapter();
const workspaceRoot = "C:\\worktrees\\session-1";
const workspaceId = unwrap(parseWorkspaceId("workspace-1"));
const taskId = unwrap(parseTaskId("01ARZ3NDEKTSV4RRFFQ69G5FCX"));
const sessionId = unwrap(parseCodingTaskSessionId("01ARZ3NDEKTSV4RRFFQ69G5FAV"));
const actionId = unwrap(parseActionId("01ARZ3NDEKTSV4RRFFQ69G5FCY"));

describe("CodingTask Session Admission Coordinator", () => {
  it("在同一 Lease 内完成 auth -> pending -> v2 Intent -> admitted，并按 Trace -> v2 Observation -> v1 Resolution 闭合", async () => {
    const fixture = createFixture();
    const coordinator = new CodingTaskSessionAdmissionCoordinator(fixture.dependencies);

    const pre = await coordinator.admitPreAction({
      payload: fixture.pre,
      expectedVersion: 0,
      invocationProvenance: fixture.invocation,
    });
    const post = await coordinator.recordPostAction({
      payload: fixture.post,
      expectedVersion: 1,
      invocationProvenance: fixture.invocation,
    });

    expect(pre.status).toBe(ResultStatus.Success);
    expect(post.status).toBe(ResultStatus.Success);
    expect(fixture.authorizationCalls).toBe(1);
    expect(fixture.leaseAcquireCalls).toBe(2);
    expect(fixture.leaseReleaseCalls).toBe(2);
    expect(fixture.state.status).toBe("waiting_agent");
    expect(fixture.state.admittedActionIds).toEqual([actionId]);
    expect(fixture.state.pendingAdmission).toBeNull();
    expect(fixture.journal.observations).toHaveLength(1);
    expect(fixture.journal.observations[0]?.schemaVersion).toBe("2.0.0");
    expect(fixture.traceObservations).toHaveLength(1);
    const traceObservation = fixture.traceObservations[0];
    const observation = fixture.journal.observations[0];
    if (traceObservation === undefined || observation === undefined || !("trace" in observation)) {
      throw new Error("Trace binding fixture should be complete");
    }
    expect(observation.trace.observationDigest).toBe(unwrap(digest.calculate(traceObservation)));
    expect(traceObservation.actionId).toBe(actionId);
    expect(fixture.journal.resolutions[0]?.schemaVersion).toBe("1.0.0");
    expect(fixture.journal.status).toBe(ActionJournalStatus.Committed);
  });

  it("已闭合 PostAction 的精确重放不会重复写入 Trace", async () => {
    const fixture = createFixture();
    const coordinator = new CodingTaskSessionAdmissionCoordinator(fixture.dependencies);
    await admit(fixture, coordinator);
    const first = await coordinator.recordPostAction({
      payload: fixture.post,
      expectedVersion: 1,
      invocationProvenance: fixture.invocation,
    });

    const replay = await coordinator.recordPostAction({
      payload: fixture.post,
      expectedVersion: 3,
      invocationProvenance: fixture.invocation,
    });

    expect(first.status).toBe(ResultStatus.Success);
    expect(replay.status).toBe(ResultStatus.Success);
    expect(fixture.traceObservations).toHaveLength(1);
    expect(fixture.journal.observations).toHaveLength(1);
    expect(fixture.journal.resolutions).toHaveLength(1);
  });

  it("已闭合 PostAction 的内容漂移在写 Trace 前拒绝", async () => {
    const fixture = createFixture();
    const coordinator = new CodingTaskSessionAdmissionCoordinator(fixture.dependencies);
    await admit(fixture, coordinator);
    await coordinator.recordPostAction({
      payload: fixture.post,
      expectedVersion: 1,
      invocationProvenance: fixture.invocation,
    });

    const replay = await coordinator.recordPostAction({
      payload: { ...fixture.post, endedAt: "2026-07-12T00:00:03.000Z" },
      expectedVersion: 3,
      invocationProvenance: fixture.invocation,
    });

    expectFailure(replay, HarnessErrorCode.OperationForbidden);
    expect(fixture.traceObservations).toHaveLength(1);
    expect(fixture.journal.observations).toHaveLength(1);
  });

  it.each([
    [
      "sessionContext",
      (fixture: Fixture) => ({
        ...fixture.pre,
        sessionContext: {
          ...fixture.pre.sessionContext,
          sessionId: "01ARZ3NDEKTSV4RRFFQ69G5FCZ",
        },
      }),
    ],
    [
      "sessionBindingDigest",
      (fixture: Fixture) => ({
        ...fixture.pre,
        sessionContext: { ...fixture.pre.sessionContext, sessionBindingDigest: contentDigest("e") },
      }),
    ],
    [
      "actor",
      (fixture: Fixture) => ({
        ...fixture.pre,
        actor: { kind: ActorKind.Agent, actorId: "agent:other" },
      }),
    ],
    [
      "workspace",
      (fixture: Fixture) => ({
        ...fixture.pre,
        workspaceId: unwrap(parseWorkspaceId("workspace-other")),
      }),
    ],
    [
      "task",
      (fixture: Fixture) => ({
        ...fixture.pre,
        taskId: unwrap(parseTaskId("01ARZ3NDEKTSV4RRFFQ69G5FCZ")),
      }),
    ],
    [
      "activation identity",
      (fixture: Fixture) => {
        fixture.activation = { ...fixture.activation, agentActorId: "agent:other" };
        return fixture.pre;
      },
    ],
    [
      "invocation session",
      (fixture: Fixture) => ({
        ...fixture.pre,
        sessionId: "executor-other",
      }),
    ],
    [
      "invocation targets",
      (fixture: Fixture) => ({
        ...fixture.pre,
        targets: ["other-target"],
      }),
    ],
    [
      "invocation input digest",
      (fixture: Fixture) => ({
        ...fixture.pre,
        inputDigest: contentDigest("e"),
      }),
    ],
  ] as const)("拒绝 %s 漂移，且不写入 Journal", async (_name, mutate) => {
    const fixture = createFixture();
    const payload = mutate(fixture);
    const coordinator = new CodingTaskSessionAdmissionCoordinator(fixture.dependencies);

    const result = await coordinator.admitPreAction({
      payload,
      expectedVersion: 0,
      invocationProvenance: fixture.invocation,
    });

    expectFailure(result, HarnessErrorCode.OperationForbidden);
    expect(fixture.journalCreateCalls).toBe(0);
    expect(fixture.journalAppendCalls).toBe(0);
  });

  it("Intent 写失败后 State 进入 outcome_unknown", async () => {
    const fixture = createFixture({
      intentError: new HarnessError(HarnessErrorCode.IoFailure, "intent write failed"),
    });
    const coordinator = new CodingTaskSessionAdmissionCoordinator(fixture.dependencies);

    const result = await coordinator.admitPreAction({
      payload: fixture.pre,
      expectedVersion: 0,
      invocationProvenance: fixture.invocation,
    });

    expectFailure(result, HarnessErrorCode.CodingTaskSessionAdmissionCommitOutcomeUnknown);
    expect(fixture.state.status).toBe("outcome_unknown");
  });

  it("Intent 持久化降级后 State 进入 outcome_unknown", async () => {
    const fixture = createFixture({ intentPersistence: PersistenceHealth.Degraded });
    const coordinator = new CodingTaskSessionAdmissionCoordinator(fixture.dependencies);

    const result = await coordinator.admitPreAction({
      payload: fixture.pre,
      expectedVersion: 0,
      invocationProvenance: fixture.invocation,
    });

    expectFailure(result, HarnessErrorCode.CodingTaskSessionAdmissionCommitOutcomeUnknown);
    expect(fixture.state.status).toBe("outcome_unknown");
  });

  it.each([
    ["Observation", { observationPersistence: PersistenceHealth.Degraded }],
    ["Resolution", { resolutionPersistence: PersistenceHealth.Degraded }],
  ] as const)("PostAction %s 持久化降级后 State 进入 outcome_unknown", async (_stage, options) => {
    const fixture = createFixture(options);
    const coordinator = new CodingTaskSessionAdmissionCoordinator(fixture.dependencies);
    await admit(fixture, coordinator);

    const result = await coordinator.recordPostAction({
      payload: fixture.post,
      expectedVersion: 1,
      invocationProvenance: fixture.invocation,
    });

    expectFailure(result, HarnessErrorCode.CodingTaskSessionAdmissionCommitOutcomeUnknown);
    expect(fixture.state.status).toBe("outcome_unknown");
  });

  it("Intent 已写而 Admission commit 失败时返回 AdmissionCommitOutcomeUnknown", async () => {
    const fixture = createFixture({
      replaceFailureAt: 2,
      replaceError: new HarnessError(HarnessErrorCode.IoFailure, "admission commit failed"),
    });
    const coordinator = new CodingTaskSessionAdmissionCoordinator(fixture.dependencies);

    const result = await coordinator.admitPreAction({
      payload: fixture.pre,
      expectedVersion: 0,
      invocationProvenance: fixture.invocation,
    });

    expectFailure(result, HarnessErrorCode.CodingTaskSessionAdmissionCommitOutcomeUnknown);
    expect(fixture.journalCreateCalls).toBe(1);
    expect(fixture.state.status).toBe(CodingTaskSessionAdmissionStatus.OutcomeUnknown);
  });

  it("Pending replace 结果未知时对账真实快照并持久化 outcome_unknown", async () => {
    const fixture = createFixture({
      replaceFailureAt: 1,
      replaceFailureCommits: true,
      replaceError: new HarnessError(HarnessErrorCode.IoFailure, "pending commit unknown"),
    });
    const coordinator = new CodingTaskSessionAdmissionCoordinator(fixture.dependencies);

    const result = await coordinator.admitPreAction({
      payload: fixture.pre,
      expectedVersion: 0,
      invocationProvenance: fixture.invocation,
    });

    expectFailure(result, HarnessErrorCode.CodingTaskSessionAdmissionCommitOutcomeUnknown);
    expect(fixture.journalCreateCalls).toBe(0);
    expect(fixture.state.status).toBe(CodingTaskSessionAdmissionStatus.OutcomeUnknown);
    expect(fixture.state.pendingAdmission?.actionId).toBe(fixture.pre.actionId);
  });

  it("最终 State replace 已写但回执未知时从提交后快照进入 outcome_unknown", async () => {
    const fixture = createFixture({
      replaceFailureAt: 2,
      replaceFailureCommits: true,
      replaceError: new HarnessError(HarnessErrorCode.IoFailure, "state commit unknown"),
    });
    const coordinator = new CodingTaskSessionAdmissionCoordinator(fixture.dependencies);

    const result = await coordinator.admitPreAction({
      payload: fixture.pre,
      expectedVersion: 0,
      invocationProvenance: fixture.invocation,
    });

    expectFailure(result, HarnessErrorCode.CodingTaskSessionAdmissionCommitOutcomeUnknown);
    expect(fixture.state.status).toBe(CodingTaskSessionAdmissionStatus.OutcomeUnknown);
    expect(fixture.state.pendingAdmission).toBeNull();
    expect(fixture.state.admittedActionIds).toEqual([fixture.pre.actionId]);
  });

  it("Admission Lease release 失败时返回 LockReleaseUnknown", async () => {
    const fixture = createFixture({
      releaseError: new HarnessError(
        HarnessErrorCode.CodingTaskSessionAdmissionLockReleaseUnknown,
        "release unknown",
      ),
    });
    const coordinator = new CodingTaskSessionAdmissionCoordinator(fixture.dependencies);

    const result = await coordinator.admitPreAction({
      payload: fixture.pre,
      expectedVersion: 0,
      invocationProvenance: fixture.invocation,
    });

    expectFailure(result, HarnessErrorCode.CodingTaskSessionAdmissionLockReleaseUnknown);
  });

  it("缺失 Post 的 IntentRecorded Action 阻止 beginClosing，正常闭合后进入 closing", async () => {
    const fixture = createFixture();
    const coordinator = new CodingTaskSessionAdmissionCoordinator(fixture.dependencies);
    await admit(fixture, coordinator);

    const blocked = await coordinator.beginClosing({
      workspaceId,
      sessionId,
      updatedAt: "2026-07-23T00:00:02.000Z",
    });
    expectFailure(blocked, HarnessErrorCode.PreconditionNotMet);

    await closeAction(fixture, coordinator);
    const closed = await coordinator.beginClosing({
      workspaceId,
      sessionId,
      updatedAt: "2026-07-23T00:00:04.000Z",
    });
    expect(closed.status).toBe(ResultStatus.Success);
    expect(fixture.state.status).toBe("closing");
  });

  it("重复 beginClosing 会重新复验已准入 Action，并幂等复用 closing 版本", async () => {
    const fixture = createFixture();
    const coordinator = new CodingTaskSessionAdmissionCoordinator(fixture.dependencies);
    await admit(fixture, coordinator);
    await closeAction(fixture, coordinator);

    const first = await coordinator.beginClosing({
      workspaceId,
      sessionId,
      updatedAt: "2026-07-23T00:00:04.000Z",
    });
    expect(first.status).toBe(ResultStatus.Success);
    const closingVersion = fixture.state.version;
    const closingReplaceCalls = fixture.replaceCalls;

    const repeated = await coordinator.beginClosing({
      workspaceId,
      sessionId,
      updatedAt: "2026-07-23T00:00:05.000Z",
    });
    expect(repeated.status).toBe(ResultStatus.Success);
    expect(fixture.state.version).toBe(closingVersion);
    expect(fixture.replaceCalls).toBe(closingReplaceCalls);
  });

  it.each([ActionJournalStatus.WaitingHuman, ActionJournalStatus.RetryPermitted])(
    "%s Action 未经 Human 闭合时阻止 beginClosing",
    async (resolutionStatus) => {
      const fixture = createFixture({ resolutionStatus });
      const coordinator = new CodingTaskSessionAdmissionCoordinator(fixture.dependencies);
      await admit(fixture, coordinator);
      await closeAction(fixture, coordinator);

      const result = await coordinator.beginClosing({
        workspaceId,
        sessionId,
        updatedAt: "2026-07-23T00:00:04.000Z",
      });

      expectFailure(result, HarnessErrorCode.PreconditionNotMet);
      expect(fixture.state.status).toBe("waiting_agent");
    },
  );

  it("closing 拒绝新 Pre，但允许已准入 Action 的 Post", async () => {
    const fixture = createFixture();
    const coordinator = new CodingTaskSessionAdmissionCoordinator(fixture.dependencies);
    await admit(fixture, coordinator);
    await closeAction(fixture, coordinator);
    const closing = await coordinator.beginClosing({
      workspaceId,
      sessionId,
      updatedAt: "2026-07-23T00:00:03.000Z",
    });
    expect(closing.status).toBe(ResultStatus.Success);
    expect(fixture.state.status).toBe("closing");

    const newPre = {
      ...fixture.pre,
      actionId: unwrap(parseActionId("01ARZ3NDEKTSV4RRFFQ69G5FCZ")),
    };
    const rejected = await coordinator.admitPreAction({
      payload: newPre,
      expectedVersion: 0,
      invocationProvenance: fixture.invocation,
    });
    expectFailure(rejected, HarnessErrorCode.InvalidStateTransition);

    const post = await coordinator.recordPostAction({
      payload: fixture.post,
      expectedVersion: 3,
      invocationProvenance: fixture.invocation,
    });
    expect(post.status).toBe(ResultStatus.Success);
  });

  it("Pre 先持有 Lease 时，竞争中的 Closing fail closed，释放后按缺失 Post 处理", async () => {
    const preBarrier = createBarrier();
    const fixture = createFixture({ preAuthorizationBarrier: preBarrier });
    const coordinator = new CodingTaskSessionAdmissionCoordinator(fixture.dependencies);

    const preAttempt = coordinator.admitPreAction({
      payload: fixture.pre,
      expectedVersion: 0,
      invocationProvenance: fixture.invocation,
    });
    await preBarrier.reached;

    const contendedClosing = await coordinator.beginClosing({
      workspaceId,
      sessionId,
      updatedAt: "2026-07-23T00:00:02.000Z",
    });
    expectFailure(contendedClosing, HarnessErrorCode.LockUnavailable);

    preBarrier.release();
    const pre = await preAttempt;
    expect(pre.status).toBe(ResultStatus.Success);

    const closing = await coordinator.beginClosing({
      workspaceId,
      sessionId,
      updatedAt: "2026-07-23T00:00:03.000Z",
    });
    expectFailure(closing, HarnessErrorCode.PreconditionNotMet);
  });

  it("Closing 先持有 Lease 时，竞争中的 Pre fail closed，释放后按 closing 状态拒绝", async () => {
    const fixture = createFixture();
    const coordinator = new CodingTaskSessionAdmissionCoordinator(fixture.dependencies);
    await admit(fixture, coordinator);
    await closeAction(fixture, coordinator);

    const closingBarrier = createBarrier();
    fixture.setClosingJournalLoadBarrier(closingBarrier);
    const closingAttempt = coordinator.beginClosing({
      workspaceId,
      sessionId,
      updatedAt: "2026-07-23T00:00:04.000Z",
    });
    await closingBarrier.reached;

    const contendedPre = await coordinator.admitPreAction({
      payload: {
        ...fixture.pre,
        actionId: unwrap(parseActionId("01ARZ3NDEKTSV4RRFFQ69G5FCZ")),
      },
      expectedVersion: 0,
      invocationProvenance: fixture.invocation,
    });
    expectFailure(contendedPre, HarnessErrorCode.LockUnavailable);

    closingBarrier.release();
    const closing = await closingAttempt;
    expect(closing.status).toBe(ResultStatus.Success);
    expect(fixture.state.status).toBe("closing");

    const pre = await coordinator.admitPreAction({
      payload: {
        ...fixture.pre,
        actionId: unwrap(parseActionId("01ARZ3NDEKTSV4RRFFQ69G5FCZ")),
      },
      expectedVersion: 0,
      invocationProvenance: fixture.invocation,
    });
    expectFailure(pre, HarnessErrorCode.InvalidStateTransition);
  });

  it("Trace Dropped 只把 disposition、reason 和 recovery path digest 写入 v2 Observation", async () => {
    const recoveryPaths = ["C:\\worktrees\\session-1\\.recovery", "D:\\agent\\secret.log"];
    const fixture = createFixture({
      traceOutcome: {
        disposition: TraceWriteDisposition.Dropped,
        reason: TraceDropReason.Contended,
        recoveryPaths,
      },
    });
    const coordinator = new CodingTaskSessionAdmissionCoordinator(fixture.dependencies);
    await admit(fixture, coordinator);

    const result = await coordinator.recordPostAction({
      payload: fixture.post,
      expectedVersion: 1,
      invocationProvenance: fixture.invocation,
    });

    expect(result.status).toBe(ResultStatus.Success);
    const observation = fixture.journal.observations[0];
    expect(observation?.schemaVersion).toBe(ActionJournalSchemaVersion.Session);
    if (observation === undefined || !("trace" in observation)) return;
    const trace = observation.trace;
    expect(trace).toEqual({
      observationDigest: unwrap(digest.calculate(fixture.traceObservations[0])),
      disposition: SessionActionTraceDisposition.Dropped,
      dropReason: SessionActionTraceDropReason.Contended,
      recoveryPathDigests: recoveryPaths
        .map((path) => unwrap(digest.calculate({ recoveryPath: path })))
        .sort(),
    });
    expect(JSON.stringify(trace)).not.toContain(recoveryPaths[0]);
    expect(JSON.stringify(trace)).not.toContain(recoveryPaths[1]);
  });

  it("Trace Observation digest 计算失败时不写入 Trace 或 Observation", async () => {
    const fixture = createFixture({
      traceDigestError: new HarnessError(HarnessErrorCode.InvalidInput, "trace digest failed"),
    });
    const coordinator = new CodingTaskSessionAdmissionCoordinator(fixture.dependencies);
    await admit(fixture, coordinator);

    const result = await coordinator.recordPostAction({
      payload: fixture.post,
      expectedVersion: 1,
      invocationProvenance: fixture.invocation,
    });

    expectFailure(result, HarnessErrorCode.InvalidInput);
    expect(fixture.traceObservations).toHaveLength(0);
    expect(fixture.journal.observations).toHaveLength(0);
    expect(fixture.journal.resolutions).toHaveLength(0);
  });

  it("Trace 已尝试写入后恢复路径摘要失败时进入 outcome_unknown", async () => {
    const fixture = createFixture({
      traceEvidenceDigestError: new HarnessError(
        HarnessErrorCode.InvalidInput,
        "trace evidence digest failed",
      ),
      traceOutcome: {
        disposition: TraceWriteDisposition.Persisted,
        recoveryPaths: ["D:\\runtime\\trace.lock"],
      },
    });
    const coordinator = new CodingTaskSessionAdmissionCoordinator(fixture.dependencies);
    await admit(fixture, coordinator);

    const result = await coordinator.recordPostAction({
      payload: fixture.post,
      expectedVersion: 1,
      invocationProvenance: fixture.invocation,
    });

    expectFailure(result, HarnessErrorCode.CodingTaskSessionAdmissionCommitOutcomeUnknown);
    expect(fixture.traceObservations).toHaveLength(1);
    expect(fixture.journal.observations).toHaveLength(0);
    expect(fixture.journal.resolutions).toHaveLength(0);
    expect(fixture.state.status).toBe(CodingTaskSessionAdmissionStatus.OutcomeUnknown);
  });

  it("Trace 已写入但恢复证据超过上限时进入 outcome_unknown", async () => {
    const fixture = createFixture({
      traceOutcome: {
        disposition: TraceWriteDisposition.Persisted,
        recoveryPaths: Array.from({ length: 257 }, (_, index) => `D:\\runtime\\${index}.lock`),
      },
    });
    const coordinator = new CodingTaskSessionAdmissionCoordinator(fixture.dependencies);
    await admit(fixture, coordinator);

    const result = await coordinator.recordPostAction({
      payload: fixture.post,
      expectedVersion: 1,
      invocationProvenance: fixture.invocation,
    });

    expectFailure(result, HarnessErrorCode.CodingTaskSessionAdmissionCommitOutcomeUnknown);
    expect(fixture.traceObservations).toHaveLength(1);
    expect(fixture.journal.observations).toHaveLength(0);
    expect(fixture.state.status).toBe(CodingTaskSessionAdmissionStatus.OutcomeUnknown);
  });
});

/** Coordinator Fake 的故障注入项。 */
interface FixtureOptions {
  readonly intentError?: HarnessError;
  readonly intentPersistence?: PersistenceHealth;
  /** Observation 提交后的持久化健康状态。 */
  readonly observationPersistence?: PersistenceHealth;
  /** Resolution 提交后的持久化健康状态。 */
  readonly resolutionPersistence?: PersistenceHealth;
  readonly replaceFailureAt?: number;
  /** replace 返回失败前是否已经把候选状态写入，用于模拟回执未知。 */
  readonly replaceFailureCommits?: boolean;
  readonly replaceError?: HarnessError;
  readonly releaseError?: HarnessError;
  readonly traceDigestError?: HarnessError;
  readonly traceEvidenceDigestError?: HarnessError;
  readonly traceOutcome?: {
    readonly disposition: TraceWriteDisposition;
    readonly reason?: TraceDropReason;
    readonly recoveryPaths: readonly string[];
  };
  /** Resolution 后用于模拟 Human 或重试边界的 Journal 状态。 */
  readonly resolutionStatus?: ActionJournalStatus;
  /** Pre 已持有 Lease 后用于暂停授权阶段的确定性屏障。 */
  readonly preAuthorizationBarrier?: Barrier;
}

/** 用已到达信号建立确定性并发窗口，不依赖 sleep 或调度时序。 */
interface Barrier {
  /** 操作进入竞争窗口后完成的信号。 */
  readonly reached: Promise<void>;
  /** 标记操作已经进入竞争窗口。 */
  enter(): void;
  /** 等待测试释放当前竞争窗口。 */
  wait(): Promise<void>;
  /** 允许被暂停的操作继续执行。 */
  release(): void;
}

/** Coordinator 测试运行时及其可观察计数器。 */
interface Fixture {
  readonly dependencies: CodingTaskSessionAdmissionCoordinatorDependencies;
  readonly pre: SessionPreActionHookPayload;
  readonly post: SessionPostActionHookPayload;
  readonly invocation: CommandInvocationProvenance;
  readonly journal: ActionJournalState;
  readonly authorizationCalls: number;
  readonly leaseAcquireCalls: number;
  readonly leaseReleaseCalls: number;
  readonly journalCreateCalls: number;
  readonly journalAppendCalls: number;
  /** Admission State replace 总次数。 */
  readonly replaceCalls: number;
  readonly traceObservations: readonly TraceSpanObservation[];
  activation: CodingTaskSessionActivationRecord;
  state: CodingTaskSessionAdmissionState;
  /** 为下一次 Closing Journal 读取安装确定性屏障。 */
  setClosingJournalLoadBarrier(barrier: Barrier): void;
}

function createFixture(options: FixtureOptions = {}): Fixture {
  const activation = createActivation();
  const binding = createBinding(activation);
  const state = unwrap(
    createCodingTaskSessionAdmissionState({
      workspaceId,
      sessionId,
      activationBindingDigest: activation.bindingDigest,
      sessionBindingDigest: binding.sessionBindingDigest as ContentDigest,
      updatedAt: activation.activatedAt,
    }),
  );
  const invocation = createInvocation("executor-session", ["src/index.ts"], contentDigest("a"));
  const pre = createPre(invocation);
  const post = createPost(invocation);
  let currentState = state;
  let currentJournal = createEmptyJournal(pre);
  let activationValue = activation;
  let authorizationCalls = 0;
  let leaseAcquireCalls = 0;
  let leaseReleaseCalls = 0;
  let journalCreateCalls = 0;
  let journalAppendCalls = 0;
  const traceObservations: TraceSpanObservation[] = [];
  let replaceCalls = 0;
  let closingJournalLoadBarrier: Barrier | undefined;
  let admissionLeaseHeld = false;

  class FixtureBindingStore implements HookBindingStore {
    public bind(
      bindingValue: HookWorkspaceBinding,
    ): Promise<Result<HookWorkspaceBinding, HarnessError>>;
    public bind(
      bindingValue: SessionHookBinding,
    ): Promise<Result<SessionHookBinding, HarnessError>>;
    public bind(bindingValue: HookBinding): Promise<Result<HookBinding, HarnessError>> {
      return Promise.resolve(success(bindingValue));
    }

    public find(): Promise<Result<HookBinding, HarnessError>> {
      return Promise.resolve(success(binding));
    }

    public findSession(): Promise<Result<SessionHookBinding, HarnessError>> {
      return Promise.resolve(success(binding));
    }
  }
  const bindingStore: HookBindingStore = new FixtureBindingStore();
  const activationRepository: CodingTaskSessionActivationRepository = {
    create: (value) =>
      Promise.resolve(
        success({
          disposition: CodingTaskSessionActivationDisposition.Created,
          record: value,
        }),
      ),
    load: () => Promise.resolve(success(activationValue)),
  };
  const stateStore: CodingTaskSessionAdmissionStateStore = {
    create: (value) =>
      Promise.resolve(
        success({
          disposition: CodingTaskSessionAdmissionStateCreateDisposition.Created,
          state: value,
        }),
      ),
    load: () => Promise.resolve(success(currentState)),
    replace: ({ expectedVersion, state: nextState }) => {
      replaceCalls += 1;
      if (options.replaceFailureAt === replaceCalls) {
        if (options.replaceFailureCommits) currentState = nextState;
        return Promise.resolve(
          failure(
            options.replaceError ?? new HarnessError(HarnessErrorCode.IoFailure, "replace failed"),
          ),
        );
      }
      if (expectedVersion !== currentState.version) {
        return Promise.resolve(
          failure(new HarnessError(HarnessErrorCode.VersionConflict, "state version conflict")),
        );
      }
      if (nextState.version !== expectedVersion + 1) {
        return Promise.resolve(
          failure(
            new HarnessError(HarnessErrorCode.InvalidInput, "candidate version must increment"),
          ),
        );
      }
      currentState = nextState;
      return Promise.resolve(success(currentState));
    },
  };
  const admissionLease: CodingTaskSessionAdmissionLease = {
    acquire: () => {
      leaseAcquireCalls += 1;
      // Lease double 采用真实的非等待排他语义：持有时立即返回 LockUnavailable，释放后才可重入。
      if (admissionLeaseHeld) {
        return Promise.resolve(
          failure(new HarnessError(HarnessErrorCode.LockUnavailable, "Admission Lease 已被占用。")),
        );
      }
      admissionLeaseHeld = true;
      return Promise.resolve(
        success({
          release: () => {
            leaseReleaseCalls += 1;
            if (options.releaseError !== undefined) {
              return Promise.resolve(failure(options.releaseError));
            }
            admissionLeaseHeld = false;
            return Promise.resolve(success(undefined));
          },
        }),
      );
    },
  };
  const actionJournal: ActionJournalRepository = {
    createIntent: (intent) => {
      journalCreateCalls += 1;
      if (options.intentError !== undefined) return Promise.resolve(failure(options.intentError));
      currentJournal = {
        ...currentJournal,
        intent,
        lastSequence: 1,
        status: ActionJournalStatus.IntentRecorded,
      };
      return Promise.resolve(success(mutation(currentJournal, options.intentPersistence)));
    },
    appendObservation: (observation) => {
      journalAppendCalls += 1;
      currentJournal = {
        ...currentJournal,
        observations: [...currentJournal.observations, observation],
        lastSequence: 2,
        status: ActionJournalStatus.AwaitingResolution,
      };
      return Promise.resolve(success(mutation(currentJournal, options.observationPersistence)));
    },
    appendResolution: (resolution) => {
      journalAppendCalls += 1;
      currentJournal = {
        ...currentJournal,
        resolutions: [...currentJournal.resolutions, resolution],
        lastSequence: 3,
        status: options.resolutionStatus ?? ActionJournalStatus.Committed,
      };
      return Promise.resolve(success(mutation(currentJournal, options.resolutionPersistence)));
    },
    load: async () => {
      if (closingJournalLoadBarrier !== undefined) {
        const barrier = closingJournalLoadBarrier;
        closingJournalLoadBarrier = undefined;
        barrier.enter();
        await barrier.wait();
      }
      return success(currentJournal);
    },
    listRecoverable: () => Promise.resolve(success([])),
  };
  const traceStore: TraceObservationStore = {
    record: (observation) => {
      traceObservations.push(observation);
      return Promise.resolve(
        options.traceOutcome ?? {
          disposition: TraceWriteDisposition.Persisted,
          recoveryPaths: [],
        },
      );
    },
    query: () => Promise.resolve(success({ observations: [], skippedRecordCount: 0 })),
  };
  const dependencies: CodingTaskSessionAdmissionCoordinatorDependencies = {
    bindingStore,
    activationRepository,
    stateStore,
    admissionLease,
    actionJournal,
    traceStore,
    authorization: {
      authorize: async () => {
        authorizationCalls += 1;
        if (options.preAuthorizationBarrier !== undefined) {
          options.preAuthorizationBarrier.enter();
          await options.preAuthorizationBarrier.wait();
        }
        return success({ authorized: true });
      },
    },
    digest: createDigestPort(options.traceDigestError, options.traceEvidenceDigestError),
  };

  const fixture: Fixture = {
    dependencies,
    pre,
    post,
    invocation,
    journal: currentJournal,
    authorizationCalls,
    leaseAcquireCalls,
    leaseReleaseCalls,
    journalCreateCalls,
    journalAppendCalls,
    replaceCalls,
    traceObservations,
    get activation() {
      return activationValue;
    },
    set activation(value) {
      activationValue = value;
    },
    setClosingJournalLoadBarrier(barrier) {
      closingJournalLoadBarrier = barrier;
    },
    get state() {
      return currentState;
    },
    set state(value) {
      currentState = value;
    },
  };
  Object.defineProperties(fixture, {
    journal: { get: () => currentJournal },
    authorizationCalls: { get: () => authorizationCalls },
    leaseAcquireCalls: { get: () => leaseAcquireCalls },
    leaseReleaseCalls: { get: () => leaseReleaseCalls },
    journalCreateCalls: { get: () => journalCreateCalls },
    journalAppendCalls: { get: () => journalAppendCalls },
    replaceCalls: { get: () => replaceCalls },
  });
  return fixture;
}

function createDigestPort(
  traceDigestError: HarnessError | undefined,
  traceEvidenceDigestError: HarnessError | undefined,
): ContentDigestPort {
  return {
    calculate(input) {
      if (traceDigestError !== undefined && isTraceObservationInput(input)) {
        return failure(traceDigestError);
      }
      if (traceEvidenceDigestError !== undefined && isRecoveryPathDigestInput(input)) {
        return failure(traceEvidenceDigestError);
      }
      return digest.calculate(input);
    },
  };
}

function isTraceObservationInput(input: unknown): boolean {
  return typeof input === "object" && input !== null && "traceId" in input && "spanId" in input;
}

function isRecoveryPathDigestInput(input: unknown): boolean {
  return typeof input === "object" && input !== null && "recoveryPath" in input;
}

function createBarrier(): Barrier {
  let markReached!: () => void;
  let release!: () => void;
  const reached = new Promise<void>((resolve) => {
    markReached = resolve;
  });
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    reached,
    enter: () => markReached(),
    wait: () => released,
    release: () => release(),
  };
}

async function admit(
  fixture: Fixture,
  coordinator: CodingTaskSessionAdmissionCoordinator,
): Promise<void> {
  const result = await coordinator.admitPreAction({
    payload: fixture.pre,
    expectedVersion: 0,
    invocationProvenance: fixture.invocation,
  });
  expect(result.status).toBe(ResultStatus.Success);
}

async function closeAction(
  fixture: Fixture,
  coordinator: CodingTaskSessionAdmissionCoordinator,
): Promise<void> {
  const result = await coordinator.recordPostAction({
    payload: fixture.post,
    expectedVersion: 1,
    invocationProvenance: fixture.invocation,
  });
  expect(result.status).toBe(ResultStatus.Success);
}

function createPre(
  invocation: CommandInvocationProvenance,
  overrides: Partial<SessionPreActionHookPayload> = {},
): SessionPreActionHookPayload {
  return {
    schemaVersion: CANONICAL_SESSION_HOOK_SCHEMA_VERSION,
    event: HarnessHookEvent.PreAction,
    hookExecutionId: "hook-pre-1",
    executor: HookExecutorKind.Codex,
    sessionId: "executor-session",
    turnId: "turn-1",
    workspaceId,
    taskId,
    actionId,
    actor: agent("agent:codex"),
    commandId: "command-1",
    correlationId: "correlation-1",
    occurredAt: "2026-07-23T00:00:01.000Z",
    sessionContext: {
      sessionId,
      sessionBindingDigest: fixtureBindingDigest(),
    },
    idempotencyKey: "idempotency-1",
    actionKind: ActionKind.FileMutation,
    targets: ["src/index.ts"],
    inputDigest: invocation.inputDigest,
    postconditionDigest: contentDigest("b"),
    recoveryGuidance: "恢复并重新检查文件状态",
    planRiskArtifactId: unwrap(parseArtifactId("01ARZ3NDEKTSV4RRFFQ69G5FCZ")),
    planRiskArtifactDigest: unwrap(parseArtifactDigest(contentDigest("c"))),
    ...overrides,
  };
}

function createPost(
  invocation: CommandInvocationProvenance,
  overrides: Partial<SessionPostActionHookPayload> = {},
): SessionPostActionHookPayload {
  return {
    schemaVersion: CANONICAL_SESSION_HOOK_SCHEMA_VERSION,
    event: HarnessHookEvent.PostAction,
    hookExecutionId: "hook-post-1",
    executor: HookExecutorKind.Codex,
    sessionId: "executor-session",
    turnId: "turn-1",
    workspaceId,
    taskId,
    actionId,
    actor: agent("agent:codex"),
    commandId: "command-post-1",
    correlationId: "correlation-1",
    occurredAt: "2026-07-23T00:00:02.000Z",
    sessionContext: {
      sessionId,
      sessionBindingDigest: fixtureBindingDigest(),
    },
    causationId: "command-1",
    outcome: ActionOutcome.Succeeded,
    evidenceIds: ["evidence-1"],
    traceId: unwrap(parseTraceId("11111111111111111111111111111111")),
    spanId: unwrap(parseSpanId("2222222222222222")),
    toolName: invocation.toolName,
    toolCallId: invocation.toolCallIdDigest,
    startedAt: "2026-07-23T00:00:01.100Z",
    endedAt: "2026-07-23T00:00:01.900Z",
    ...overrides,
  };
}

function createInvocation(
  executorSessionId: string,
  targets: readonly string[],
  inputDigest: ContentDigest,
): CommandInvocationProvenance {
  const sessionIdDigest = unwrap(digest.calculate(executorSessionId));
  const turnIdDigest = unwrap(digest.calculate("turn-1"));
  const toolCallDigest = unwrap(digest.calculate("tool-call-1"));
  const invocationId = unwrap(
    digest.calculate({
      executor: HookExecutorKind.Codex,
      sessionIdDigest,
      turnIdDigest,
      toolCallIdDigest: toolCallDigest,
      toolName: "apply_patch",
    }),
  );
  return {
    schemaVersion: COMMAND_INVOCATION_PROVENANCE_SCHEMA_VERSION,
    executor: HookExecutorKind.Codex,
    invocationId,
    sessionIdDigest,
    turnIdDigest,
    toolCallIdDigest: toolCallDigest,
    toolName: "apply_patch",
    targetsDigest: unwrap(digest.calculate(targets)),
    inputDigest,
  };
}

function createActivation(): CodingTaskSessionActivationRecord {
  return unwrap(
    createCodingTaskSessionActivationRecord(
      {
        schemaVersion: CODING_TASK_SESSION_ACTIVATION_SCHEMA_VERSION,
        sessionId,
        workspaceId,
        codingTaskId: unwrap(parseCodingTaskId("coding-task-1")),
        sourceTaskId: taskId,
        repositoryId: unwrap(parseRepositoryId("repository-1")),
        attemptNumber: 1,
        attemptStartedAt: "2026-07-23T00:00:00.000Z",
        worktreeId: "worktree-1",
        worktreeRootDigest: unwrap(digest.calculate({ worktreeRoot: workspaceRoot })),
        planRiskArtifactId: unwrap(parseArtifactId("01ARZ3NDEKTSV4RRFFQ69G5FCZ")),
        planRiskArtifactDigest: unwrap(parseArtifactDigest(contentDigest("c"))),
        agentActorId: "agent:codex",
        activatedAt: "2026-07-23T00:00:00.000Z",
      },
      digest,
    ),
  );
}

function createBinding(activation: CodingTaskSessionActivationRecord) {
  return unwrap(
    createSessionHookBinding(
      {
        schemaVersion: "2.0.0",
        workspaceRoot,
        workspaceId: activation.workspaceId,
        taskId: activation.sourceTaskId,
        planRiskArtifactId: activation.planRiskArtifactId,
        planRiskArtifactDigest: activation.planRiskArtifactDigest,
        actorId: activation.agentActorId,
        boundAt: activation.activatedAt,
        sessionId: activation.sessionId,
        codingTaskId: activation.codingTaskId,
        attemptNumber: activation.attemptNumber,
        worktreeId: activation.worktreeId,
        worktreeRootDigest: activation.worktreeRootDigest,
        activationBindingDigest: activation.bindingDigest,
      },
      digest,
    ),
  );
}

function createEmptyJournal(payload: SessionPreActionHookPayload): ActionJournalState {
  return {
    intent: {
      schemaVersion: ActionJournalSchemaVersion.Session,
      recordType: ActionJournalRecordType.Intent,
      actionId: payload.actionId,
      sequence: 1,
      workspaceId,
      taskId,
      commandId: payload.commandId,
      correlationId: payload.correlationId,
      idempotencyKey: payload.idempotencyKey,
      kind: payload.actionKind,
      target: JSON.stringify(payload.targets),
      targets: payload.targets,
      inputDigest: payload.inputDigest,
      postconditionDigest: payload.postconditionDigest,
      recoveryGuidance: payload.recoveryGuidance,
      sessionProvenance: {
        sessionId,
        codingTaskId: unwrap(parseCodingTaskId("coding-task-1")),
        attemptNumber: 1,
        worktreeId: "worktree-1",
        worktreeRootDigest: unwrap(digest.calculate({ worktreeRoot: workspaceRoot })),
        activationBindingDigest: contentDigest("0"),
        sessionBindingDigest: contentDigest("0"),
        executorSessionIdDigest: contentDigest("0"),
      },
      actor: payload.actor,
      recordedAt: payload.occurredAt,
    },
    observations: [],
    resolutions: [],
    lastSequence: 0,
    status: ActionJournalStatus.IntentRecorded,
  };
}

function mutation(
  state: ActionJournalState,
  health: PersistenceHealth = PersistenceHealth.Healthy,
): ActionJournalMutationOutput {
  return {
    state,
    disposition: ActionJournalMutationDisposition.Appended,
    persistence: {
      overall: health,
      actionLock: LockReleaseStatus.Released,
      journalDirectory: ParentDirectorySyncStatus.Synced,
      recoveryPaths: [],
    },
  };
}

function fixtureBindingDigest(): ContentDigest {
  return createBinding(createActivation()).sessionBindingDigest as ContentDigest;
}

function agent(actorId: string): ActorRef {
  return { kind: ActorKind.Agent, actorId };
}

function contentDigest(hexCharacter: string): ContentDigest {
  return unwrap(parseContentDigest(`sha256:${hexCharacter.repeat(64)}`));
}

function unwrap<T>(result: Result<T, HarnessErrorType>): T {
  if (result.status === ResultStatus.Failure) throw result.error;
  return result.value;
}

function expectFailure<T>(result: Result<T, HarnessError>, code: HarnessErrorCode): void {
  expect(result.status).toBe(ResultStatus.Failure);
  if (result.status === ResultStatus.Failure) expect(result.error.code).toBe(code);
}
