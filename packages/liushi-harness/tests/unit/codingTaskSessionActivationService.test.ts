import { describe, expect, it } from "vitest";

import {
  ActivateCodingTaskSessionService,
  CODING_TASK_AGGREGATE_TYPE,
  CODING_TASK_SESSION_ACTIVATION_MANIFEST_SCHEMA_VERSION,
  CodingTaskCommandType,
  CodingTaskSessionActivationDisposition,
  CodingTaskSessionActivationStage,
  CodingTaskSessionActivationStatus,
  CommandErrorCode,
  CommandStatus,
  WORKTREE_PROVISION_COMMAND_TYPE,
  type CodingTaskSessionActivationLease,
  type CodingTaskSessionRuntimeBinding,
} from "#application/index.js";
import {
  COMMAND_ENVELOPE_SCHEMA_VERSION,
  COMMAND_RECEIPT_SCHEMA_VERSION,
} from "#application/command/index.js";
import { CODING_TASK_AGGREGATE_SCHEMA_VERSION } from "#common/index.js";
import type { CodingTaskAggregateRecord } from "#domain/codingTask/index.js";
import {
  CodingTaskPhase,
  CodingTaskRunState,
  type CodingTaskAggregate,
} from "#domain/codingTask/index.js";
import { GateEvaluationResult } from "#domain/policy/index.js";
import type { CodingTaskSessionActivationRecord } from "#domain/codingTaskSession/index.js";
import {
  ActorKind,
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  parseContentDigest,
  success,
  type ContentDigest,
  type Result,
} from "#common/index.js";

const SESSION_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const SOURCE_TASK_ID = "01ARZ3NDEKTSV4RRFFQ69G5FCX";
const PLAN_RISK_REPORTED_ID = "01ARZ3NDEKTSV4RRFFQ69G5FCY";
const PLAN_RISK_AUTHORITATIVE_ID = "01ARZ3NDEKTSV4RRFFQ69G5FCZ";
const CODING_TASK_ID = "coding-task-1";
const REPOSITORY_ID = "repository-1";
const WORKTREE_ID = "worktree-1";
const CORRELATION_ID = "session-correlation";
const ATTEMPT_STARTED_AT = "2026-07-23T00:00:00.000Z";
const DIGEST = contentDigest("a");
const PLAN_RISK_REPORTED_DIGEST = contentDigest("b");
const PLAN_RISK_AUTHORITATIVE_DIGEST = contentDigest("c");
const RUNTIME_BINDING: CodingTaskSessionRuntimeBinding = {
  workspaceId: "workspace-1",
  repositoryId: REPOSITORY_ID,
  repositoryRoot: "C:\\repo",
  agentActorId: "agent:codex",
};

describe("CodingTask Session Activation Application 服务", () => {
  it("按 Create、Provision、StartAttempt、权威读取和 Activation create 顺序完成并进入等待 Agent", async () => {
    const harness = createHarness();
    const result = await harness.service.execute(createManifest());

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Failure) return;
    expect(result.value.status).toBe(CodingTaskSessionActivationStatus.WaitingAgent);
    expect(result.value.persistenceDisposition).toBe(
      CodingTaskSessionActivationDisposition.Created,
    );
    expect(harness.calls).toEqual([
      "activation.load",
      "create",
      "provision",
      "start_attempt",
      "codingTask.load",
      "activation.create",
    ]);
    expect(harness.persistedRecord).toMatchObject({
      sourceTaskId: harness.authoritativeRecord.aggregate.sourceTaskId,
      planRiskArtifactId: PLAN_RISK_AUTHORITATIVE_ID,
      planRiskArtifactDigest: PLAN_RISK_AUTHORITATIVE_DIGEST,
      attemptStartedAt: harness.authoritativeRecord.aggregate.attempts[0]?.startedAt,
      activatedAt: harness.authoritativeRecord.aggregate.attempts[0]?.startedAt,
    });
    expect(harness.persistedRecord?.planRiskArtifactId).not.toBe(PLAN_RISK_REPORTED_ID);
    expect(harness.persistedRecord?.planRiskArtifactDigest).not.toBe(PLAN_RISK_REPORTED_DIGEST);
  });

  it("复用首次权威持久化的 Activation 时不再执行任何命令", async () => {
    const firstHarness = createHarness();
    const firstResult = await firstHarness.service.execute(createManifest());

    expect(firstResult.status).toBe(ResultStatus.Success);
    const persistedRecord = firstHarness.persistedRecord;
    expect(persistedRecord).toBeDefined();
    if (persistedRecord === undefined) return;

    const secondHarness = createHarness({ activationLoad: success(persistedRecord) });
    const secondResult = await secondHarness.service.execute(createManifest());

    expect(secondResult.status).toBe(ResultStatus.Success);
    if (secondResult.status === ResultStatus.Failure) return;
    expect(secondResult.value.status).toBe(CodingTaskSessionActivationStatus.WaitingAgent);
    expect(secondResult.value.persistenceDisposition).toBe(
      CodingTaskSessionActivationDisposition.Reused,
    );
    expect(secondHarness.calls).toEqual(["activation.load"]);
    expect(secondHarness.authoritativeLoadCount).toBe(0);
    expect(secondHarness.activationCreateCount).toBe(0);
  });

  it("两个 Service 并发激活同一 Session 时只执行一次命令副作用", async () => {
    const activationStore: ActivationStore = {};
    const activationLease = createSerialActivationLease();
    const firstHarness = createHarness({ activationStore, activationLease });
    const secondHarness = createHarness({ activationStore, activationLease });

    const [firstResult, secondResult] = await Promise.all([
      firstHarness.service.execute(createManifest()),
      secondHarness.service.execute(createManifest()),
    ]);

    expect(firstResult.status).toBe(ResultStatus.Success);
    expect(secondResult.status).toBe(ResultStatus.Success);
    if (firstResult.status === ResultStatus.Failure || secondResult.status === ResultStatus.Failure)
      return;
    expect(firstResult.value.status).toBe(CodingTaskSessionActivationStatus.WaitingAgent);
    expect(secondResult.value.status).toBe(CodingTaskSessionActivationStatus.WaitingAgent);
    expect(firstHarness.calls).toEqual([
      "activation.load",
      "create",
      "provision",
      "start_attempt",
      "codingTask.load",
      "activation.create",
    ]);
    expect(secondHarness.calls).toEqual(["activation.load"]);
    expect(firstHarness.activationCreateCount + secondHarness.activationCreateCount).toBe(1);
  });

  it.each([
    [CodingTaskSessionActivationStage.Create, CommandStatus.Rejected],
    [CodingTaskSessionActivationStage.Create, CommandStatus.Conflict],
    [CodingTaskSessionActivationStage.Create, CommandStatus.OutcomeUnknown],
    [CodingTaskSessionActivationStage.Provision, CommandStatus.Rejected],
    [CodingTaskSessionActivationStage.Provision, CommandStatus.Conflict],
    [CodingTaskSessionActivationStage.Provision, CommandStatus.OutcomeUnknown],
    [CodingTaskSessionActivationStage.StartAttempt, CommandStatus.Rejected],
    [CodingTaskSessionActivationStage.StartAttempt, CommandStatus.Conflict],
    [CodingTaskSessionActivationStage.StartAttempt, CommandStatus.OutcomeUnknown],
  ])("%s 阶段 receipt 为 %s 时立即停止并不读取权威 Aggregate", async (stage, status) => {
    const harness = createHarness({
      createStatus: stage === CodingTaskSessionActivationStage.Create ? status : undefined,
      provisionStatus: stage === CodingTaskSessionActivationStage.Provision ? status : undefined,
      startStatus: stage === CodingTaskSessionActivationStage.StartAttempt ? status : undefined,
    });
    const result = await harness.service.execute(createManifest());

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Failure) return;
    expect(result.value.status).toBe(
      status === CommandStatus.OutcomeUnknown
        ? CodingTaskSessionActivationStatus.OutcomeUnknown
        : CodingTaskSessionActivationStatus.Blocked,
    );
    expect(result.value.stoppedStage).toBe(stage);
    expect(harness.calls).toEqual([
      "activation.load",
      ...(stage === CodingTaskSessionActivationStage.Create ? ["create"] : []),
      ...(stage === CodingTaskSessionActivationStage.Provision ? ["create", "provision"] : []),
      ...(stage === CodingTaskSessionActivationStage.StartAttempt
        ? ["create", "provision", "start_attempt"]
        : []),
    ]);
    expect(harness.authoritativeLoadCount).toBe(0);
    expect(harness.activationCreateCount).toBe(0);
  });

  it.each([
    ["缺少 Runtime Binding", () => ({ omitRuntimeBinding: true })],
    ["Manifest 额外字段", () => ({ manifest: { unexpected: true } })],
    [
      "错误 Create command type",
      () => ({ createCommand: { commandType: CodingTaskCommandType.StartAttempt } }),
    ],
    ["错误 aggregate type", () => ({ createCommand: { aggregateType: "other_aggregate" } })],
    ["错误 correlation", () => ({ startAttemptCommand: { correlationId: "other-correlation" } })],
    ["重复 command ID", () => ({ startAttemptCommand: { commandId: "create-command" } })],
    ["错误 expectedVersion", () => ({ createCommand: { expectedVersion: 1 } })],
    ["错误 payload digest", () => ({ createCommand: { requestDigest: contentDigest("d") } })],
    ["错误 repository root", () => ({ provisionRuntime: { repositoryRoot: "relative/repo" } })],
    ["错误 workspace", () => ({ createPayload: { workspaceId: "workspace-other" } })],
    ["错误 repository", () => ({ createPayload: { repositoryId: "repository-other" } })],
    [
      "Command Actor 与 Runtime Actor 不一致",
      () => ({ createCommand: { actor: { kind: ActorKind.Agent, actorId: "agent:other" } } }),
    ],
    [
      "Command Actor 不是 Agent",
      () => ({ createCommand: { actor: { kind: ActorKind.Human, actorId: "agent:codex" } } }),
    ],
    ["非 managed worktree", () => ({ worktreeBinding: { managed: false } })],
  ])("%s 在命令服务调用前失败", async (_name, change) => {
    const options = change();
    const harness = createHarness(options);
    const result = await harness.service.execute(createManifest(options));

    expect(result.status).toBe(ResultStatus.Failure);
    expect(harness.calls).toEqual([]);
    expect(harness.authoritativeLoadCount).toBe(0);
    expect(harness.activationCreateCount).toBe(0);
  });

  it("已有相同 Activation 时返回 reused 且不执行三个命令", async () => {
    const existing = activationRecord();
    const harness = createHarness({ activationLoad: success(existing) });
    const result = await harness.service.execute(createManifest());

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Failure) return;
    expect(result.value.status).toBe(CodingTaskSessionActivationStatus.WaitingAgent);
    expect(result.value.persistenceDisposition).toBe(CodingTaskSessionActivationDisposition.Reused);
    expect(harness.calls).toEqual(["activation.load"]);
    expect(harness.authoritativeLoadCount).toBe(0);
  });

  it("相同 session 但 Activation 身份不同返回 blocked 且不执行三个命令", async () => {
    const harness = createHarness({
      activationLoad: success(activationRecord({ agentActorId: "agent:other" })),
    });
    const result = await harness.service.execute(createManifest());

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Failure) return;
    expect(result.value.status).toBe(CodingTaskSessionActivationStatus.Blocked);
    expect(result.value.stoppedStage).toBe(CodingTaskSessionActivationStage.Persistence);
    expect(harness.calls).toEqual(["activation.load"]);
    expect(harness.authoritativeLoadCount).toBe(0);
  });

  it("Activation Repository conflict 返回 blocked 并保留 persistence stage", async () => {
    const harness = createHarness({
      activationCreateDisposition: CodingTaskSessionActivationDisposition.Conflict,
    });
    const result = await harness.service.execute(createManifest());

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Failure) return;
    expect(result.value.status).toBe(CodingTaskSessionActivationStatus.Blocked);
    expect(result.value.stoppedStage).toBe(CodingTaskSessionActivationStage.Persistence);
    expect(harness.calls).toEqual([
      "activation.load",
      "create",
      "provision",
      "start_attempt",
      "codingTask.load",
      "activation.create",
    ]);
  });

  it("Activation Record 落盘结果未知时返回 outcome_unknown 且禁止自动重试", async () => {
    const harness = createHarness({
      activationCreateError: new HarnessError(
        HarnessErrorCode.CodingTaskSessionActivationCommitOutcomeUnknown,
        "fake outcome unknown",
      ),
    });

    const result = await harness.service.execute(createManifest());

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Failure) return;
    expect(result.value.status).toBe(CodingTaskSessionActivationStatus.OutcomeUnknown);
    expect(result.value.stoppedStage).toBe(CodingTaskSessionActivationStage.Persistence);
    expect(harness.activationCreateCount).toBe(1);
  });

  it("落盘结果未知且 Lease 释放失败时保留禁止自动重试语义", async () => {
    const harness = createHarness({
      activationCreateError: new HarnessError(
        HarnessErrorCode.CodingTaskSessionActivationCommitOutcomeUnknown,
        "fake outcome unknown",
      ),
      activationLeaseReleaseError: new HarnessError(
        HarnessErrorCode.IoFailure,
        "fake release failure",
      ),
    });

    const result = await harness.service.execute(createManifest());

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Success) return;
    expect(result.error.code).toBe(
      HarnessErrorCode.CodingTaskSessionActivationCommitOutcomeUnknown,
    );
    expect(result.error.details).toEqual({
      stage: CodingTaskSessionActivationStage.Persistence,
      leaseReleaseErrorCode: HarnessErrorCode.IoFailure,
    });
    expect(harness.activationCreateCount).toBe(1);
  });

  it("无法取得 Session Lease 时在全部命令副作用前关闭式拒绝", async () => {
    const harness = createHarness({
      activationLeaseError: new HarnessError(HarnessErrorCode.LockUnavailable, "fake lease busy"),
    });

    const result = await harness.service.execute(createManifest());

    expect(result.status).toBe(ResultStatus.Failure);
    expect(harness.calls).toEqual([]);
    if (result.status === ResultStatus.Failure) {
      expect(result.error.code).toBe(HarnessErrorCode.LockUnavailable);
      expect(result.error.details["stage"]).toBe(CodingTaskSessionActivationStage.Persistence);
    }
  });

  it("Session Lease 释放失败时关闭式拒绝已经生成的成功结果", async () => {
    const harness = createHarness({
      activationLeaseReleaseError: new HarnessError(
        HarnessErrorCode.ActionExecutionLockReleaseUnknown,
        "fake release unknown",
      ),
    });

    const result = await harness.service.execute(createManifest());

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Failure) {
      expect(result.error.code).toBe(HarnessErrorCode.ActionExecutionLockReleaseUnknown);
      expect(result.error.details["stage"]).toBe(CodingTaskSessionActivationStage.Persistence);
    }
  });

  it.each([
    ["持久化", "activationLoad", CodingTaskSessionActivationStage.Persistence],
    ["权威读取", "authoritativeLoad", CodingTaskSessionActivationStage.AuthoritativeBinding],
  ])("%s错误保留 %s stage", async (_name, source, stage) => {
    const error = new HarnessError(HarnessErrorCode.IoFailure, "fake failure");
    const harness = createHarness({ [source]: failure(error) });
    const result = await harness.service.execute(createManifest());

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Failure) {
      expect(result.error.details["stage"]).toBe(stage);
    }
  });
});

/** Session Activation 测试夹具的可选覆盖项。 */
interface HarnessOptions {
  readonly omitRuntimeBinding?: boolean;
  readonly manifest?: Record<string, unknown>;
  readonly createCommand?: Record<string, unknown>;
  readonly provisionCommand?: Record<string, unknown>;
  readonly startAttemptCommand?: Record<string, unknown>;
  readonly provisionRuntime?: Record<string, unknown>;
  readonly createPayload?: Record<string, unknown>;
  readonly worktreeBinding?: Record<string, unknown>;
  readonly createStatus?: CommandStatus | undefined;
  readonly provisionStatus?: CommandStatus | undefined;
  readonly startStatus?: CommandStatus | undefined;
  readonly activationLoad?: Result<CodingTaskSessionActivationRecord, HarnessError>;
  readonly authoritativeLoad?: Result<CodingTaskAggregateRecord, HarnessError>;
  readonly activationCreateDisposition?: CodingTaskSessionActivationDisposition;
  readonly activationCreateError?: HarnessError;
  readonly activationLeaseError?: HarnessError;
  readonly activationLeaseReleaseError?: HarnessError;
  readonly activationStore?: ActivationStore;
  readonly activationLease?: CodingTaskSessionActivationLease;
}

/** 并发测试中由两个 Service 共享的最小 Activation Store。 */
interface ActivationStore {
  record?: CodingTaskSessionActivationRecord;
}

/** Session Activation 测试夹具及其可观察调用状态。 */
interface Harness {
  readonly service: ActivateCodingTaskSessionService;
  readonly calls: string[];
  readonly authoritativeRecord: CodingTaskAggregateRecord;
  readonly persistedRecord: CodingTaskSessionActivationRecord | undefined;
  readonly authoritativeLoadCount: number;
  readonly activationCreateCount: number;
}

function createHarness(options: HarnessOptions = {}): Harness {
  const calls: string[] = [];
  let persistedRecord = options.activationStore?.record;
  let authoritativeLoadCount = 0;
  let activationCreateCount = 0;
  const authoritativeRecord = aggregateRecord();
  const activationLoad =
    options.activationLoad ??
    failure(new HarnessError(HarnessErrorCode.PreconditionNotMet, "missing activation"));
  const authoritativeLoad = options.authoritativeLoad ?? success(authoritativeRecord);

  const codingTaskCommands = {
    execute: (input: unknown) => {
      const command = input as { readonly commandType: string };
      const isCreate = command.commandType === String(CodingTaskCommandType.Create);
      calls.push(isCreate ? "create" : "start_attempt");
      return Promise.resolve(
        success(
          commandReceipt(
            input,
            isCreate
              ? (options.createStatus ?? CommandStatus.Committed)
              : (options.startStatus ?? CommandStatus.Committed),
          ),
        ),
      );
    },
  };
  const worktreeProvisionCommands = {
    execute: (input: unknown) => {
      calls.push("provision");
      return Promise.resolve(
        success(commandReceipt(input, options.provisionStatus ?? CommandStatus.Committed)),
      );
    },
  };
  const codingTaskRepository = {
    load: () => {
      calls.push("codingTask.load");
      authoritativeLoadCount += 1;
      return Promise.resolve(authoritativeLoad);
    },
  };
  const activationRepository = {
    load: () => {
      calls.push("activation.load");
      if (options.activationStore === undefined) return Promise.resolve(activationLoad);
      return Promise.resolve(
        options.activationStore.record === undefined
          ? failure(new HarnessError(HarnessErrorCode.PreconditionNotMet, "missing activation"))
          : success(options.activationStore.record),
      );
    },
    create: (record: CodingTaskSessionActivationRecord) => {
      calls.push("activation.create");
      activationCreateCount += 1;
      if (options.activationCreateError !== undefined) {
        return Promise.resolve(failure(options.activationCreateError));
      }
      persistedRecord = record;
      if (options.activationStore !== undefined) options.activationStore.record = record;
      return Promise.resolve(
        success({
          disposition:
            options.activationCreateDisposition ?? CodingTaskSessionActivationDisposition.Created,
          record,
        }),
      );
    },
  };
  const digest = {
    calculate: () => success(DIGEST),
  };
  const runtimePath = {
    resolveManagedWorktreeRoot: ({
      repositoryRoot,
      worktreeRelativePath,
    }: {
      readonly repositoryRoot: string;
      readonly worktreeRelativePath: string;
    }) => success(`${repositoryRoot}/${worktreeRelativePath}`),
    hasSamePathIdentity: (left: string, right: string) => left === right,
  };
  const defaultActivationLease = {
    acquire: () =>
      Promise.resolve(
        options.activationLeaseError === undefined
          ? success({
              release: () =>
                Promise.resolve(
                  options.activationLeaseReleaseError === undefined
                    ? success(undefined)
                    : failure(options.activationLeaseReleaseError),
                ),
            })
          : failure(options.activationLeaseError),
      ),
  };
  const admissionInitializer = {
    ensure: () => Promise.resolve(success({ binding: {}, state: {} } as never)),
  };
  const service = new ActivateCodingTaskSessionService(
    codingTaskCommands as unknown as ConstructorParameters<
      typeof ActivateCodingTaskSessionService
    >[0],
    worktreeProvisionCommands as unknown as ConstructorParameters<
      typeof ActivateCodingTaskSessionService
    >[1],
    codingTaskRepository as unknown as ConstructorParameters<
      typeof ActivateCodingTaskSessionService
    >[2],
    activationRepository,
    digest,
    runtimePath,
    options.activationLease ?? defaultActivationLease,
    admissionInitializer,
    options.omitRuntimeBinding ? undefined : RUNTIME_BINDING,
  );

  return {
    service,
    calls,
    authoritativeRecord,
    get persistedRecord() {
      return persistedRecord;
    },
    get authoritativeLoadCount() {
      return authoritativeLoadCount;
    },
    get activationCreateCount() {
      return activationCreateCount;
    },
  };
}

function createSerialActivationLease(): CodingTaskSessionActivationLease {
  let tail = Promise.resolve();
  return {
    async acquire() {
      const previous = tail;
      let releaseCurrent = (): void => undefined;
      tail = new Promise<void>((resolve) => {
        releaseCurrent = resolve;
      });
      await previous;
      return success({
        release: () => {
          releaseCurrent();
          return Promise.resolve(success(undefined));
        },
      });
    },
  };
}

function createManifest(options: HarnessOptions = {}): Record<string, unknown> {
  const create = commandEnvelope("create-command", CodingTaskCommandType.Create, 0, {
    workspaceId: RUNTIME_BINDING.workspaceId,
    sourceTaskId: SOURCE_TASK_ID,
    repositoryId: RUNTIME_BINDING.repositoryId,
    baseRevision: "main",
    worktreeBinding: {
      worktreeId: WORKTREE_ID,
      relativePath: "managed/session",
      branchName: "session-branch",
      managed: true,
      ...options.worktreeBinding,
    },
    writeSet: ["src/index.ts"],
    inputBindingSet: { bindings: [] },
    executionAuthorization: {
      planRisk: {
        artifactId: PLAN_RISK_REPORTED_ID,
        artifactDigest: PLAN_RISK_REPORTED_DIGEST,
        result: GateEvaluationResult.Allow,
        requiredGates: [],
        satisfiedApprovalIds: [],
      },
      historicalLogicChange: false,
    },
    ...options.createPayload,
  });
  const provision = commandEnvelope(
    "provision-command",
    WORKTREE_PROVISION_COMMAND_TYPE,
    1,
    {
      workspaceId: RUNTIME_BINDING.workspaceId,
      actionId: "01ARZ3NDEKTSV4RRFFQ69G5FD0",
      repositoryRootDigest: DIGEST,
    },
    options.provisionCommand,
  );
  const startAttempt = commandEnvelope(
    "start-command",
    CodingTaskCommandType.StartAttempt,
    1,
    { workspaceId: RUNTIME_BINDING.workspaceId, attemptNumber: 1 },
    options.startAttemptCommand,
  );
  return {
    schemaVersion: CODING_TASK_SESSION_ACTIVATION_MANIFEST_SCHEMA_VERSION,
    sessionId: SESSION_ID,
    createCommand: { ...create, ...options.createCommand },
    provision: {
      command: { ...provision, ...options.provisionCommand },
      runtime: {
        repositoryRoot: RUNTIME_BINDING.repositoryRoot,
        ...options.provisionRuntime,
      },
    },
    startAttemptCommand: { ...startAttempt, ...options.startAttemptCommand },
    ...options.manifest,
  } satisfies Record<string, unknown>;
}

function commandEnvelope(
  commandId: string,
  commandType: string,
  expectedVersion: number,
  payload: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    schemaVersion: COMMAND_ENVELOPE_SCHEMA_VERSION,
    commandId,
    commandType,
    aggregateType: CODING_TASK_AGGREGATE_TYPE,
    aggregateId: CODING_TASK_ID,
    expectedVersion,
    idempotencyKey: commandId,
    requestDigest: DIGEST,
    actor: { kind: ActorKind.Agent, actorId: "agent:codex" },
    authorizationContext: {},
    correlationId: CORRELATION_ID,
    submittedAt: "2026-07-23T00:00:00.000Z",
    payload,
    ...overrides,
  };
}

function commandReceipt(input: unknown, status: CommandStatus) {
  const command = input as { readonly commandId: string };
  if (status === CommandStatus.Committed) {
    return {
      schemaVersion: COMMAND_RECEIPT_SCHEMA_VERSION,
      commandId: command.commandId,
      status,
      requestDigest: DIGEST,
      committedVersion: 1,
    };
  }
  if (status === CommandStatus.Duplicate) {
    return {
      schemaVersion: COMMAND_RECEIPT_SCHEMA_VERSION,
      commandId: command.commandId,
      status,
      requestDigest: DIGEST,
      duplicateOfCommandId: command.commandId,
    };
  }
  return {
    schemaVersion: COMMAND_RECEIPT_SCHEMA_VERSION,
    commandId: command.commandId,
    status,
    requestDigest: DIGEST,
    errorCode:
      status === CommandStatus.OutcomeUnknown
        ? CommandErrorCode.OutcomeUnknown
        : status === CommandStatus.Conflict
          ? CommandErrorCode.VersionConflict
          : CommandErrorCode.PreconditionNotMet,
  };
}

function aggregateRecord(): CodingTaskAggregateRecord {
  const aggregate: CodingTaskAggregate = {
    schemaVersion: CODING_TASK_AGGREGATE_SCHEMA_VERSION,
    codingTaskId: CODING_TASK_ID as CodingTaskAggregate["codingTaskId"],
    workspaceId: RUNTIME_BINDING.workspaceId as CodingTaskAggregate["workspaceId"],
    sourceTaskId: SOURCE_TASK_ID as CodingTaskAggregate["sourceTaskId"],
    repositoryId: REPOSITORY_ID as CodingTaskAggregate["repositoryId"],
    baseRevision: "main",
    worktreeBinding: {
      worktreeId: WORKTREE_ID,
      relativePath: "managed/session",
      branchName: "session-branch",
      managed: true,
    },
    writeSet: ["src/index.ts"],
    inputBindingSet: { bindings: [] },
    executionAuthorization: {
      planRisk: {
        artifactId:
          PLAN_RISK_AUTHORITATIVE_ID as CodingTaskAggregate["executionAuthorization"]["planRisk"]["artifactId"],
        artifactDigest: PLAN_RISK_AUTHORITATIVE_DIGEST,
        result: GateEvaluationResult.Allow,
        requiredGates: [],
        satisfiedApprovalIds: [],
      },
      historicalLogicChange: false,
    },
    phase: CodingTaskPhase.Implementation,
    runState: CodingTaskRunState.Active,
    attempts: [{ number: 1, startedAt: ATTEMPT_STARTED_AT }],
    version: 3,
    createdAt: "2026-07-23T00:00:00.000Z",
    updatedAt: ATTEMPT_STARTED_AT,
  };
  return { aggregate, lastSequence: 3, lastEventHash: "event-hash" };
}

function activationRecord(
  overrides: Partial<CodingTaskSessionActivationRecord> = {},
): CodingTaskSessionActivationRecord {
  return {
    schemaVersion: "coding-task-session.activation.v1",
    sessionId: SESSION_ID as CodingTaskSessionActivationRecord["sessionId"],
    workspaceId: RUNTIME_BINDING.workspaceId as CodingTaskSessionActivationRecord["workspaceId"],
    codingTaskId: CODING_TASK_ID as CodingTaskSessionActivationRecord["codingTaskId"],
    sourceTaskId: SOURCE_TASK_ID as CodingTaskSessionActivationRecord["sourceTaskId"],
    repositoryId: REPOSITORY_ID as CodingTaskSessionActivationRecord["repositoryId"],
    attemptNumber: 1,
    attemptStartedAt: ATTEMPT_STARTED_AT,
    worktreeId: WORKTREE_ID,
    worktreeRootDigest: DIGEST,
    planRiskArtifactId:
      PLAN_RISK_REPORTED_ID as CodingTaskSessionActivationRecord["planRiskArtifactId"],
    planRiskArtifactDigest: PLAN_RISK_REPORTED_DIGEST,
    agentActorId: "agent:codex",
    activatedAt: ATTEMPT_STARTED_AT,
    bindingDigest: DIGEST,
    ...overrides,
  };
}

function contentDigest(character: string): ContentDigest {
  const parsed = parseContentDigest(`sha256:${character.repeat(64)}`);
  if (parsed.status === ResultStatus.Failure) throw parsed.error;
  return parsed.value;
}
