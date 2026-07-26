import {
  AssessCodingTaskSessionCloseoutRecoveryUseCase,
  CodingTaskSessionCloseoutRecoveryAssessmentService,
  type CodingTaskSessionCloseoutRecoveryAssessment,
} from "../../../src/application/codingTaskSessionCloseoutRecovery/index.js";
import {
  bindCheckpoint,
  block,
  markOutcomeUnknown,
  persistSnapshot,
  type CodingTaskSessionCloseoutState,
} from "../../../src/application/codingTaskSessionCloseoutState/index.js";
import {
  ChangeSetCheckpointRecoveryStatus,
  type ChangeSetCheckpointRecoveryAssessment,
} from "../../../src/application/changeSetCheckpoint/index.js";
import { CodingTaskSessionActivationDisposition } from "../../../src/application/ports/index.js";
import {
  ActorKind,
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  parseContentDigest,
  success,
  type Result,
} from "../../../src/common/index.js";
import {
  createCloseoutManagerAuthority,
  createCloseoutManagerCoverage,
} from "../codingTaskSessionCloseoutManager/index.js";
import {
  digest,
  initialState,
  snapshot,
  checkpoint,
  unwrap,
} from "../codingTaskSessionCloseout/codingTaskSessionCloseoutStateFixture.js";
/** Assessment Harness 的只读端口调用计数。 */
export interface CodingTaskSessionCloseoutRecoveryHarnessCalls {
  /** Snapshot 只读检查调用次数。 */
  snapshot: number;
  /** Checkpoint Recovery 只读检查调用次数。 */
  checkpointRecovery: number;
  /** 不应发生的 Checkpoint execute 调用次数。 */
  checkpointExecute: number;
  /** 不应发生的 State replace 调用次数。 */
  stateReplace: number;
  /** 不应发生的 State create 调用次数。 */
  stateCreate: number;
}
/** Assessment Harness 的端口注入选项。 */
export interface CodingTaskSessionCloseoutRecoveryHarnessOptions {
  /** Snapshot 端口的返回方式。 */
  readonly snapshotResult?: Result<ReturnType<typeof snapshot>, HarnessError>;
  /** Snapshot 端口是否抛出异常。 */
  readonly snapshotThrow?: boolean;
  /** Checkpoint Recovery 端口的返回方式。 */
  readonly checkpointResult?: Result<ChangeSetCheckpointRecoveryAssessment, HarnessError>;
  /** Checkpoint Recovery 端口是否抛出异常。 */
  readonly checkpointThrow?: boolean;
  /** 用于身份与篡改输入测试的 State 覆盖器。 */
  readonly stateOverride?: (
    state: CodingTaskSessionCloseoutState,
  ) => CodingTaskSessionCloseoutState;
}
/** 可直接调用公开 Use Case 的 Assessment Harness。 */
export interface CodingTaskSessionCloseoutRecoveryHarness {
  /** 公开 Assessment Use Case。 */
  readonly useCase: AssessCodingTaskSessionCloseoutRecoveryUseCase;
  /** 固定测试身份。 */
  readonly authority: ReturnType<typeof createCloseoutManagerAuthority>;
  /** 端口调用计数。 */
  readonly calls: CodingTaskSessionCloseoutRecoveryHarnessCalls;
  /** 运行 Assessment 并返回公开结果。 */
  readonly assess: () => Promise<Result<CodingTaskSessionCloseoutRecoveryAssessment, HarnessError>>;
}
/** 构造不具备任何写端口能力的 Closeout Recovery Assessment Harness。 */
export function createCodingTaskSessionCloseoutRecoveryHarness(
  stateKind: RecoveryStateKind,
  options: CodingTaskSessionCloseoutRecoveryHarnessOptions = {},
): CodingTaskSessionCloseoutRecoveryHarness {
  const authority = createCloseoutManagerAuthority();
  const initial = createState(authority, stateKind);
  const state = options.stateOverride?.(initial) ?? initial;
  const calls: CodingTaskSessionCloseoutRecoveryHarnessCalls = {
    snapshot: 0,
    checkpointRecovery: 0,
    checkpointExecute: 0,
    stateReplace: 0,
    stateCreate: 0,
  };
  const dependencies = {
    stateStore: {
      load: () => Promise.resolve(success(state)),
      find: () => Promise.resolve(success(null)),
      create: () => {
        calls.stateCreate += 1;
        throw new Error("Assessment 不应创建 State。");
      },
      replace: () => {
        calls.stateReplace += 1;
        throw new Error("Assessment 不应替换 State。");
      },
    },
    activationRepository: {
      load: () => Promise.resolve(success(authority.activation)),
      create: (record: typeof authority.activation) =>
        Promise.resolve(
          success({ disposition: CodingTaskSessionActivationDisposition.Created, record }),
        ),
    },
    codingTaskRepository: {
      load: () => Promise.resolve(success(authority.codingTask)),
      append: () => {
        throw new Error("Assessment 不应追加 CodingTask Event。");
      },
    },
    bindingStore: {
      findSession: () => Promise.resolve(success(authority.binding)),
      bind: () => {
        throw new Error("Assessment 不应写入 Hook Binding。");
      },
      find: () => {
        throw new Error("Assessment 不应按 cwd 查询 Hook Binding。");
      },
    },
    repositoryRootResolver: {
      resolve: () => Promise.resolve(success({ repositoryRoot: "D:/trusted-repository" })),
    },
    managedWorktreePath: {
      resolveManagedWorktreeRoot: () => success("closeout"),
    },
    snapshotInspector: {
      execute: () => {
        calls.snapshot += 1;
        if (options.snapshotThrow === true) throw new Error("Snapshot port throw");
        return Promise.resolve(options.snapshotResult ?? success(snapshot()));
      },
    },
    checkpointRecovery: {
      assess: () => {
        calls.checkpointRecovery += 1;
        if (options.checkpointThrow === true) throw new Error("Checkpoint port throw");
        return Promise.resolve(options.checkpointResult ?? success(unknownCheckpoint()));
      },
    },
    digest,
  };
  const service = new CodingTaskSessionCloseoutRecoveryAssessmentService(dependencies);
  const useCase = new AssessCodingTaskSessionCloseoutRecoveryUseCase(service);
  return {
    useCase,
    authority,
    calls,
    assess: () =>
      useCase.execute({
        workspaceId: authority.activation.workspaceId,
        sessionId: authority.activation.sessionId,
      }),
  };
}
/** Assessment Harness 使用的 Closeout State 场景。 */
export enum RecoveryStateKind {
  /** 构造 SnapshotPersisted 阶段的 CheckpointNotApplied 阻断状态。 */
  Retryable = "retryable",
  /** 构造 SnapshotPersisted 阶段的 OutcomeUnknown 状态。 */
  SnapshotPersistedUnknown = "snapshot_persisted_unknown",
  /** 构造 CheckpointBound 阶段的 OutcomeUnknown 状态。 */
  CheckpointBoundUnknown = "checkpoint_bound_unknown",
  /** 构造 Closing 阶段的 OutcomeUnknown 状态。 */
  ClosingUnknown = "closing_unknown",
}
function createState(
  authority: ReturnType<typeof createCloseoutManagerAuthority>,
  stateKind: RecoveryStateKind,
): CodingTaskSessionCloseoutState {
  const sessionBindingDigest = unwrap(parseContentDigest(authority.binding.sessionBindingDigest));
  const requestDigest = unwrap(
    digest.calculate({
      workspaceId: authority.activation.workspaceId,
      sessionId: authority.activation.sessionId,
    }),
  );
  const base = initialState({
    workspaceId: authority.activation.workspaceId,
    sessionId: authority.activation.sessionId,
    codingTaskId: authority.activation.codingTaskId,
    sourceTaskId: authority.activation.sourceTaskId,
    repositoryId: authority.activation.repositoryId,
    attemptNumber: authority.activation.attemptNumber,
    activationBindingDigest: authority.activation.bindingDigest,
    sessionBindingDigest,
    requestDigest,
    actor: { kind: ActorKind.Agent, actorId: authority.activation.agentActorId },
    createdAt: authority.activation.activatedAt,
  });
  if (stateKind === RecoveryStateKind.ClosingUnknown) {
    return unwrap(
      markOutcomeUnknown(
        base,
        {
          errorCode: HarnessErrorCode.IoFailure,
          recoveryGuidance: "等待 Human 复核。",
          updatedAt: "2026-07-26T00:00:01.000Z",
        },
        digest,
      ),
    );
  }
  const persisted = unwrap(
    persistSnapshot(
      base,
      {
        snapshot: snapshot(),
        coverageManifest: createCloseoutManagerCoverage(authority),
        updatedAt: "2026-07-26T00:00:01.000Z",
      },
      digest,
    ),
  );
  if (stateKind === RecoveryStateKind.Retryable) {
    return unwrap(
      block(
        persisted,
        {
          errorCode: HarnessErrorCode.CodingTaskSessionCloseoutCheckpointNotApplied,
          recoveryGuidance: "可在新鲜现场复核后重试一次。",
          updatedAt: "2026-07-26T00:00:02.000Z",
        },
        digest,
      ),
    );
  }
  if (stateKind === RecoveryStateKind.SnapshotPersistedUnknown) {
    return unwrap(
      markOutcomeUnknown(
        persisted,
        {
          errorCode: HarnessErrorCode.IoFailure,
          recoveryGuidance: "等待 Checkpoint 结果复核。",
          updatedAt: "2026-07-26T00:00:02.000Z",
        },
        digest,
      ),
    );
  }
  const bound = unwrap(
    bindCheckpoint(
      persisted,
      { checkpoint: checkpoint(snapshot()), updatedAt: "2026-07-26T00:00:02.000Z" },
      digest,
    ),
  );
  return unwrap(
    markOutcomeUnknown(
      bound,
      {
        errorCode: HarnessErrorCode.IoFailure,
        recoveryGuidance: "等待已绑定 Checkpoint 复核。",
        updatedAt: "2026-07-26T00:00:03.000Z",
      },
      digest,
    ),
  );
}

/** 创建与测试 Snapshot 精确绑定的 Present Checkpoint Recovery 结果。 */
export function presentCheckpoint(): ChangeSetCheckpointRecoveryAssessment {
  return { status: ChangeSetCheckpointRecoveryStatus.Present, checkpoint: checkpoint(snapshot()) };
}

/** 创建明确 Absent 的 Checkpoint Recovery 结果。 */
export function absentCheckpoint(): ChangeSetCheckpointRecoveryAssessment {
  return { status: ChangeSetCheckpointRecoveryStatus.Absent };
}

/** 创建 Unknown 的 Checkpoint Recovery 结果。 */
export function unknownCheckpoint(): ChangeSetCheckpointRecoveryAssessment {
  return { status: ChangeSetCheckpointRecoveryStatus.Unknown };
}

/** 创建返回 failure 的 Checkpoint Recovery 结果。 */
export function checkpointFailure(): Result<ChangeSetCheckpointRecoveryAssessment, HarnessError> {
  return failure(new HarnessError(HarnessErrorCode.IoFailure, "Checkpoint assessment failure"));
}

/** 创建返回 failure 的 Snapshot 检查结果。 */
export function snapshotFailure(): Result<ReturnType<typeof snapshot>, HarnessError> {
  return failure(new HarnessError(HarnessErrorCode.IoFailure, "Snapshot assessment failure"));
}

/** 解包测试用 Result。 */
export function resultValue<T>(result: Result<T, HarnessError>): T {
  if (result.status === ResultStatus.Failure) throw result.error;
  return result.value;
}
