import { describe, expect, it } from "vitest";

import {
  ActorKind,
  CODING_TASK_EVENT_SCHEMA_VERSION,
  ResultStatus,
  type ActorRef,
  type HarnessError,
  type Result,
} from "../../src/common/index.js";
import {
  CodingTaskAttemptOutcome,
  CodingTaskControlAction,
  CodingTaskEventType,
  CodingTaskHumanResolution,
  CodingTaskPhase,
  CodingTaskRunState,
  CodingTaskVerificationOutcome,
  applyCodingTaskEvent,
  createInitialCodingTaskAggregate,
  normalizeWriteSet,
  parseCodingTaskEventId,
  parseCodingTaskId,
  reduceCodingTaskEvents,
  type AttemptFinishedEvent,
  type AttemptStartedEvent,
  type CodingTaskCreatedEvent,
  type CodingTaskEvent,
  type CodingTaskEventBase,
  type CodingTaskExecutionAuthorization,
  type HumanControlAppliedEvent,
  type HumanResolutionAppliedEvent,
  type VerificationFinishedEvent,
} from "../../src/domain/codingTask/index.js";
import { FailureTaxonomy } from "../../src/domain/workflow/index.js";
import { parseArtifactDigest, parseArtifactId } from "../../src/domain/artifact/index.js";
import { parseApprovalId } from "../../src/domain/approval/index.js";
import { GateEvaluationResult, GateId } from "../../src/domain/policy/index.js";
import { parseRepositoryId, parseWorkspaceId } from "../../src/domain/workspace/index.js";
import { parseTaskId } from "../../src/domain/task/index.js";

const sourceTaskId = unwrap(parseTaskId("01ARZ3NDEKTSV4RRFFQ69G5FB2"));

const taskId = unwrap(parseCodingTaskId("task-1"));
const workspaceId = unwrap(parseWorkspaceId("workspace-1"));
const repositoryId = unwrap(parseRepositoryId("repo-1"));
const planRiskArtifactId = unwrap(parseArtifactId("01ARZ3NDEKTSV4RRFFQ69G5FAW"));
const businessLogicArtifactId = unwrap(parseArtifactId("01ARZ3NDEKTSV4RRFFQ69G5FAX"));
const planRiskDigest = unwrap(parseArtifactDigest(`sha256:${"1".repeat(64)}`));
const businessLogicDigest = unwrap(parseArtifactDigest(`sha256:${"2".repeat(64)}`));
const planRiskApprovalId = unwrap(parseApprovalId("01ARZ3NDEKTSV4RRFFQ69G5FAY"));
const businessLogicApprovalId = unwrap(parseApprovalId("01ARZ3NDEKTSV4RRFFQ69G5FAZ"));
const actor: ActorRef = { kind: ActorKind.Agent, actorId: "coding-agent" };
const human: ActorRef = { kind: ActorKind.Human, actorId: "reviewer" };

function unwrap<T>(result: Result<T, HarnessError>): T {
  if (result.status === ResultStatus.Failure) throw result.error;
  return result.value;
}

function defaultAuthorization(): CodingTaskExecutionAuthorization {
  return {
    planRisk: {
      artifactId: planRiskArtifactId,
      artifactDigest: planRiskDigest,
      result: GateEvaluationResult.Allow,
      requiredGates: [],
      satisfiedApprovalIds: [],
    },
    historicalLogicChange: false,
  };
}

function historicalAuthorization(): CodingTaskExecutionAuthorization {
  return {
    planRisk: {
      artifactId: planRiskArtifactId,
      artifactDigest: planRiskDigest,
      result: GateEvaluationResult.Allow,
      requiredGates: [GateId.G4RiskOperation],
      satisfiedApprovalIds: [planRiskApprovalId],
    },
    historicalLogicChange: true,
    businessLogic: {
      artifactId: businessLogicArtifactId,
      artifactDigest: businessLogicDigest,
      result: GateEvaluationResult.Allow,
      requiredGates: [GateId.G2BusinessLogic],
      satisfiedApprovalIds: [businessLogicApprovalId],
    },
  };
}

function eventBase(
  sequence: number,
  actorRef: ActorRef = actor,
): Omit<CodingTaskEventBase, "type"> {
  return {
    schemaVersion: CODING_TASK_EVENT_SCHEMA_VERSION,
    eventId: eventIdFor(sequence),
    codingTaskId: taskId,
    workspaceId,
    sequence,
    commandId: `command-${sequence}`,
    correlationId: "correlation-1",
    occurredAt: `2026-07-12T00:0${Math.min(sequence, 9)}:00.000Z`,
    actor: actorRef,
    previousHash: sequence === 1 ? "" : `hash-${sequence - 1}`,
    hash: `hash-${sequence}`,
  };
}

function eventIdFor(sequence: number) {
  return unwrap(
    parseCodingTaskEventId(`01ARZ3NDEKTSV4RRFFQ69G5FA${String.fromCharCode(64 + sequence)}`),
  );
}

function created(
  executionAuthorization: CodingTaskExecutionAuthorization = defaultAuthorization(),
): CodingTaskCreatedEvent {
  return {
    ...eventBase(1),
    type: CodingTaskEventType.CodingTaskCreated,
    payload: {
      sourceTaskId,
      repositoryId,
      baseRevision: "abc123",
      worktreeBinding: {
        worktreeId: "wt-1",
        relativePath: ".worktree/task-1",
        branchName: "task-1",
        managed: true,
      },
      writeSet: ["src/a.ts", "src/b.ts"],
      inputBindingSet: { bindings: [] },
      executionAuthorization,
    },
  };
}

function attemptStarted(sequence: number, attemptNumber: number): AttemptStartedEvent {
  return {
    ...eventBase(sequence),
    type: CodingTaskEventType.AttemptStarted,
    payload: { attemptNumber },
  };
}

function attemptFinished(
  sequence: number,
  attemptNumber: number,
  outcome: CodingTaskAttemptOutcome,
  failureTaxonomy?: FailureTaxonomy,
): AttemptFinishedEvent {
  const payload =
    failureTaxonomy === undefined
      ? { attemptNumber, outcome }
      : { attemptNumber, outcome, failureTaxonomy };
  return { ...eventBase(sequence), type: CodingTaskEventType.AttemptFinished, payload };
}

function verificationFinished(
  sequence: number,
  attemptNumber: number,
  outcome: CodingTaskVerificationOutcome,
  failureTaxonomy?: FailureTaxonomy,
): VerificationFinishedEvent {
  const payload =
    failureTaxonomy === undefined
      ? { attemptNumber, outcome }
      : { attemptNumber, outcome, failureTaxonomy };
  return { ...eventBase(sequence), type: CodingTaskEventType.VerificationFinished, payload };
}

function humanControl(
  sequence: number,
  action: CodingTaskControlAction,
  fromState: CodingTaskRunState,
  toState: CodingTaskRunState,
  actorRef: ActorRef = human,
): HumanControlAppliedEvent {
  return {
    ...eventBase(sequence, actorRef),
    type: CodingTaskEventType.HumanControlApplied,
    payload: { action, fromState, toState, requiresHuman: true },
  };
}

function humanResolution(
  sequence: number,
  resolution: CodingTaskHumanResolution,
  inputBindingSet?: { bindings: readonly never[] },
): HumanResolutionAppliedEvent {
  return {
    ...eventBase(sequence, human),
    type: CodingTaskEventType.HumanResolutionApplied,
    payload: {
      resolution,
      fromState: CodingTaskRunState.WaitingHuman,
      toState:
        resolution === CodingTaskHumanResolution.Cancel
          ? CodingTaskRunState.Cancelled
          : CodingTaskRunState.Active,
      ...(inputBindingSet === undefined ? {} : { inputBindingSet }),
      requiresHuman: true,
    },
  };
}

describe("CodingTask Aggregate", () => {
  it("创建并规范化 WriteSet，使用独立 CodingTask Schema", () => {
    expect(normalizeWriteSet(["src\\b.ts", "src/a.ts"])).toEqual(["src/a.ts", "src/b.ts"]);
    const aggregate = createInitialCodingTaskAggregate(created());
    expect(aggregate.schemaVersion).toBe("1.0.0");
    expect(aggregate.phase).toBe(CodingTaskPhase.Implementation);
    expect(aggregate.runState).toBe(CodingTaskRunState.Active);
    expect(aggregate.writeSet).toEqual(["src/a.ts", "src/b.ts"]);
  });

  it("历史逻辑变更必须绑定已通过 G2 的 Business Logic 授权", () => {
    const aggregate = createInitialCodingTaskAggregate(created(historicalAuthorization()));
    expect(aggregate.executionAuthorization.historicalLogicChange).toBe(true);
    expect(() =>
      createInitialCodingTaskAggregate({
        ...created(),
        payload: {
          ...created().payload,
          executionAuthorization: { ...defaultAuthorization(), historicalLogicChange: true },
        },
      }),
    ).toThrow();
  });

  it("拒绝空 Base Revision、非规范 Worktree 路径和通配符 WriteSet", () => {
    expect(() =>
      createInitialCodingTaskAggregate({
        ...created(),
        payload: { ...created().payload, baseRevision: " " },
      }),
    ).toThrow();
    expect(() =>
      createInitialCodingTaskAggregate({
        ...created(),
        payload: {
          ...created().payload,
          worktreeBinding: { ...created().payload.worktreeBinding, relativePath: "../task-1" },
        },
      }),
    ).toThrow();
    expect(() => normalizeWriteSet(["src/*.ts"])).toThrow();
  });

  it("支持多 Attempt，只有 ImplementationDefect 可以继续", () => {
    const first = createInitialCodingTaskAggregate(created());
    const failed = attemptFinished(
      3,
      1,
      CodingTaskAttemptOutcome.Failed,
      FailureTaxonomy.ImplementationDefect,
    );
    const after = applyCodingTaskEvent(
      applyCodingTaskEvent(applyCodingTaskEvent(first, attemptStarted(2, 1)), failed),
      attemptStarted(4, 2),
    );
    expect(after.attempts).toHaveLength(2);
    expect(after.runState).toBe(CodingTaskRunState.Active);
  });

  it("未完成 Attempt 或未请求 Verification 时禁止开始下一次 Attempt", () => {
    const first = createInitialCodingTaskAggregate(created());
    const started = applyCodingTaskEvent(first, attemptStarted(2, 1));
    expect(() => applyCodingTaskEvent(started, attemptStarted(3, 2))).toThrow();
    const succeeded = applyCodingTaskEvent(
      started,
      attemptFinished(3, 1, CodingTaskAttemptOutcome.Succeeded),
    );
    expect(() => applyCodingTaskEvent(succeeded, attemptStarted(4, 2))).toThrow();
  });

  it.each([
    FailureTaxonomy.RequirementOrSolutionGap,
    FailureTaxonomy.EnvironmentFailure,
    FailureTaxonomy.OutcomeUnknown,
  ])("%s 阻断到 Human，Human 可带新绑定恢复", (taxonomy) => {
    const first = createInitialCodingTaskAggregate(created());
    const outcome =
      taxonomy === FailureTaxonomy.OutcomeUnknown
        ? CodingTaskAttemptOutcome.OutcomeUnknown
        : CodingTaskAttemptOutcome.Failed;
    const blocked = applyCodingTaskEvent(
      applyCodingTaskEvent(first, attemptStarted(2, 1)),
      attemptFinished(3, 1, outcome, taxonomy),
    );
    expect(blocked.runState).toBe(CodingTaskRunState.WaitingHuman);
    const resumed = applyCodingTaskEvent(
      blocked,
      humanResolution(4, CodingTaskHumanResolution.ResumeImplementation, { bindings: [] }),
    );
    expect(resumed.runState).toBe(CodingTaskRunState.Active);
    expect(applyCodingTaskEvent(resumed, attemptStarted(5, 2)).attempts).toHaveLength(2);
  });

  it("禁止把 Passed 或 OutcomeUnknown 混入明确 Failed", () => {
    const started = applyCodingTaskEvent(
      createInitialCodingTaskAggregate(created()),
      attemptStarted(2, 1),
    );
    expect(() =>
      applyCodingTaskEvent(
        started,
        attemptFinished(3, 1, CodingTaskAttemptOutcome.Failed, FailureTaxonomy.Passed),
      ),
    ).toThrow();
    expect(() =>
      applyCodingTaskEvent(
        started,
        attemptFinished(3, 1, CodingTaskAttemptOutcome.Failed, FailureTaxonomy.OutcomeUnknown),
      ),
    ).toThrow();
  });

  it("Verification 通过进入 Completed，ImplementationDefect 返回新的 Coding Attempt", () => {
    const first = createInitialCodingTaskAggregate(created());
    const started = applyCodingTaskEvent(first, attemptStarted(2, 1));
    const finished = applyCodingTaskEvent(
      started,
      attemptFinished(3, 1, CodingTaskAttemptOutcome.Succeeded),
    );
    const requested = applyCodingTaskEvent(finished, {
      ...eventBase(4),
      type: CodingTaskEventType.VerificationRequested,
      payload: { attemptNumber: 1 },
    });
    const passed = applyCodingTaskEvent(
      requested,
      verificationFinished(5, 1, CodingTaskVerificationOutcome.Passed),
    );
    expect(passed.runState).toBe(CodingTaskRunState.Completed);

    const defect = applyCodingTaskEvent(
      requested,
      verificationFinished(
        5,
        1,
        CodingTaskVerificationOutcome.Failed,
        FailureTaxonomy.ImplementationDefect,
      ),
    );
    expect(defect.phase).toBe(CodingTaskPhase.Implementation);
    expect(defect.runState).toBe(CodingTaskRunState.Active);
    expect(applyCodingTaskEvent(defect, attemptStarted(6, 2)).attempts).toHaveLength(2);
  });

  it("拒绝 Agent 控制和错误的 Human Gate 声明", () => {
    const first = createInitialCodingTaskAggregate(created());
    expect(() =>
      applyCodingTaskEvent(
        first,
        humanControl(
          2,
          CodingTaskControlAction.Pause,
          CodingTaskRunState.Active,
          CodingTaskRunState.Paused,
          actor,
        ),
      ),
    ).toThrow();
    expect(() =>
      applyCodingTaskEvent(first, {
        ...humanControl(
          2,
          CodingTaskControlAction.Pause,
          CodingTaskRunState.Active,
          CodingTaskRunState.Paused,
        ),
        payload: {
          ...humanControl(
            2,
            CodingTaskControlAction.Pause,
            CodingTaskRunState.Active,
            CodingTaskRunState.Paused,
          ).payload,
          requiresHuman: false as true,
        },
      }),
    ).toThrow();
  });

  it("拒绝非法顺序并保持 Replay determinism", () => {
    const stream: CodingTaskEvent[] = [created(), attemptStarted(2, 1)];
    expect(() => reduceCodingTaskEvents([stream[0]!, { ...stream[1]!, sequence: 4 }])).toThrow();
    expect(reduceCodingTaskEvents(stream)).toEqual(reduceCodingTaskEvents(stream));
  });
});
