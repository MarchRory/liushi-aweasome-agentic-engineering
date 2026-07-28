import {
  block,
  CodingTaskSessionCloseoutStage,
  CodingTaskSessionCloseoutStatus,
  createCodingTaskSessionCloseoutState,
  persistSnapshot,
  type CodingTaskSessionCloseoutState,
  type CodingTaskSessionCloseoutStateInput,
} from "../../../src/application/codingTaskSessionCloseoutState/index.js";
import { CHANGE_SET_CHECKPOINT_SCHEMA_VERSION } from "../../../src/application/changeSetCheckpoint/index.js";
import {
  calculateCodingTaskSessionActionCoverageManifestDigest,
  CODING_TASK_SESSION_ACTION_COVERAGE_MANIFEST_SCHEMA_VERSION,
  type CodingTaskSessionActionCoverageManifest,
  type CodingTaskSessionActionCoverageManifestDigestInput,
} from "../../../src/application/codingTaskSessionActionCoverage/index.js";
import {
  CodingTaskSessionChangeKind,
  createCodingTaskSessionChangeSet,
  createCodingTaskSessionChangeSetSnapshot,
  type CodingTaskSessionChangeSetSnapshot,
} from "../../../src/domain/codingTaskSessionChangeSet/index.js";
import { parseActionId, type ActionId } from "../../../src/domain/actionJournal/index.js";
import { parseCodingTaskId } from "../../../src/domain/codingTask/index.js";
import { parseCodingTaskSessionId } from "../../../src/domain/codingTaskSession/index.js";
import { parseTaskId } from "../../../src/domain/task/index.js";
import { parseRepositoryId, parseWorkspaceId } from "../../../src/domain/workspace/index.js";
import {
  ActorKind,
  HarnessErrorCode,
  ResultStatus,
  type ContentDigest,
  type HarnessError,
  type Result,
} from "../../../src/common/index.js";
import type { ChangeSetCheckpoint } from "../../../src/application/changeSetCheckpoint/index.js";
import { Rfc8785Sha256DigestAdapter } from "../../../src/infrastructure/index.js";

export const digest = new Rfc8785Sha256DigestAdapter();
export const workspace = unwrap(parseWorkspaceId("closeout-test"));
export const session = unwrap(parseCodingTaskSessionId("01ARZ3NDEKTSV4RRFFQ69G5FAV"));
export const secondSession = unwrap(parseCodingTaskSessionId("01ARZ3NDEKTSV4RRFFQ69G5FAZ"));
export const sourceTask = unwrap(parseTaskId("01ARZ3NDEKTSV4RRFFQ69G5FAW"));
export const codingTask = unwrap(parseCodingTaskId("coding-task-closeout"));
export const repository = unwrap(parseRepositoryId("closeout-repository"));
export const locator = { workspaceId: workspace, sessionId: session } as const;
export const secondLocator = { workspaceId: workspace, sessionId: secondSession } as const;
export const actionIds = [
  unwrap(parseActionId("01ARZ3NDEKTSV4RRFFQ69G5FAX")),
  unwrap(parseActionId("01ARZ3NDEKTSV4RRFFQ69G5FAY")),
] as const;
export const createdAt = "2026-07-26T00:00:00.000Z";
export const activationBindingDigest = digestOf({ binding: "activation" });
export const sessionBindingDigest = digestOf({ binding: "session" });

export function initialState(
  overrides: Partial<CodingTaskSessionCloseoutStateInput> = {},
): CodingTaskSessionCloseoutState {
  return unwrap(
    createCodingTaskSessionCloseoutState({
      workspaceId: workspace,
      sessionId: session,
      codingTaskId: codingTask,
      sourceTaskId: sourceTask,
      repositoryId: repository,
      attemptNumber: 1,
      activationBindingDigest,
      sessionBindingDigest,
      requestDigest: digestOf({ request: "closeout" }),
      idempotencyKey: "closeout-idempotency-key",
      commandId: "closeout-command",
      correlationId: "closeout-correlation",
      actor: { kind: ActorKind.Agent, actorId: "closeout-agent" },
      createdAt,
      ...overrides,
    }),
  );
}

export function snapshot(): CodingTaskSessionChangeSetSnapshot {
  const changeSet = unwrap(
    createCodingTaskSessionChangeSet(
      {
        repositoryId: repository,
        baseRevision: "a".repeat(40),
        changes: [
          {
            path: "src/closeout-a.ts",
            kind: CodingTaskSessionChangeKind.Modified,
            targetContentDigest: digestOf({ content: "a" }),
          },
          {
            path: "src/closeout-b.ts",
            kind: CodingTaskSessionChangeKind.Added,
            targetContentDigest: digestOf({ content: "b" }),
          },
        ],
      },
      digest,
    ),
  );
  return unwrap(
    createCodingTaskSessionChangeSetSnapshot(
      {
        changeSet,
        worktreeId: "closeout-worktree",
        worktreeRelativePath: "worktrees/closeout",
        branchName: "task/closeout",
        observedHeadRevision: changeSet.baseRevision,
        writeSet: ["src/closeout-a.ts", "src/closeout-b.ts", "src/closeout-extra.ts"],
      },
      digest,
    ),
  );
}

export function coverageManifest(): CodingTaskSessionActionCoverageManifest {
  const input: CodingTaskSessionActionCoverageManifestDigestInput = {
    schemaVersion: CODING_TASK_SESSION_ACTION_COVERAGE_MANIFEST_SCHEMA_VERSION,
    workspaceId: workspace,
    sessionId: session,
    codingTaskId: codingTask,
    sourceTaskId: sourceTask,
    repositoryId: repository,
    attemptNumber: 1,
    activationBindingDigest,
    sessionBindingDigest,
    worktreeId: "closeout-worktree",
    worktreeRootDigest: digestOf({ worktreeRoot: "closeout" }),
    executorSessionIdDigest: digestOf({ executorSession: "closeout" }),
    agentProcessEvidenceDigest: digestOf({ agentProcessEvidence: "closeout" }),
    actions: actionIds.map((actionId) => ({
      actionId,
      targets:
        actionId === actionIds[0]
          ? ["src/closeout-a.ts"]
          : ["src/closeout-b.ts", "src/closeout-extra.ts"],
      journalDigest: digestOf({ journal: actionId }),
      traceObservationDigests: [digestOf({ trace: actionId })],
    })),
  };
  return {
    ...input,
    manifestDigest: unwrap(calculateCodingTaskSessionActionCoverageManifestDigest(input, digest)),
  };
}

export function legacyActionEvidenceDigest(
  currentSnapshot: CodingTaskSessionChangeSetSnapshot,
  ids: readonly ActionId[] = actionIds,
): ContentDigest {
  return digestOf({
    schemaVersion: "coding-task-session.closeout-action-evidence.v1",
    snapshotDigest: currentSnapshot.snapshotDigest,
    coveredActionIds: ids,
  });
}

export function checkpoint(
  currentSnapshot: CodingTaskSessionChangeSetSnapshot = snapshot(),
): ChangeSetCheckpoint {
  const checkpoint = {
    targetRevision: "b".repeat(40),
    changedPaths: currentSnapshot.changedPaths,
    checkpointDigest: digestOf({
      targetRevision: "b".repeat(40),
      changedPaths: currentSnapshot.changedPaths,
    }),
  } as const;
  return {
    schemaVersion: CHANGE_SET_CHECKPOINT_SCHEMA_VERSION,
    checkpoint,
    changeSetDigest: currentSnapshot.changeSetDigest,
    preSubmitSnapshotDigest: currentSnapshot.snapshotDigest,
    bindingDigest: digestOf({
      schemaVersion: CHANGE_SET_CHECKPOINT_SCHEMA_VERSION,
      checkpointDigest: checkpoint.checkpointDigest,
      changeSetDigest: currentSnapshot.changeSetDigest,
      preSubmitSnapshotDigest: currentSnapshot.snapshotDigest,
    }),
  };
}

export function checkpointBoundState(
  state: CodingTaskSessionCloseoutState,
  updatedAt: string,
): CodingTaskSessionCloseoutState {
  const currentSnapshot = state.snapshot ?? snapshot();
  return {
    ...state,
    status: CodingTaskSessionCloseoutStatus.CheckpointBound,
    checkpoint: checkpoint(currentSnapshot),
    version: 2,
    updatedAt,
  };
}

export function outcomeUnknownCheckpointBoundState(
  state: CodingTaskSessionCloseoutState,
  updatedAt: string,
): CodingTaskSessionCloseoutState {
  const currentSnapshot = state.snapshot ?? snapshot();
  return {
    ...state,
    status: CodingTaskSessionCloseoutStatus.OutcomeUnknown,
    checkpoint: checkpoint(currentSnapshot),
    stoppedStage: CodingTaskSessionCloseoutStage.CheckpointBound,
    errorCode: HarnessErrorCode.IoFailure,
    recoveryGuidance: "等待外部结果确认",
    version: 3,
    updatedAt,
  };
}

export function blockedState(
  state: CodingTaskSessionCloseoutState,
  updatedAt: string,
): CodingTaskSessionCloseoutState {
  return unwrap(
    block(
      state,
      {
        errorCode: HarnessErrorCode.PreconditionNotMet,
        recoveryGuidance: "人工复核",
        updatedAt,
      },
      digest,
    ),
  );
}

export function persistedState(
  base: CodingTaskSessionCloseoutState,
  currentSnapshot: CodingTaskSessionChangeSetSnapshot,
): CodingTaskSessionCloseoutState {
  return unwrap(
    persistSnapshot(
      base,
      {
        snapshot: currentSnapshot,
        coverageManifest: coverageManifest(),
        updatedAt: "2026-07-26T00:00:01.000Z",
      },
      digest,
    ),
  );
}

export function legacyV1PersistedState(
  state: CodingTaskSessionCloseoutState,
  currentSnapshot: CodingTaskSessionChangeSetSnapshot = snapshot(),
): Record<string, unknown> {
  const identity = {
    workspaceId: state.workspaceId,
    sessionId: state.sessionId,
    codingTaskId: state.codingTaskId,
    sourceTaskId: state.sourceTaskId,
    repositoryId: state.repositoryId,
    attemptNumber: state.attemptNumber,
    activationBindingDigest: state.activationBindingDigest,
    sessionBindingDigest: state.sessionBindingDigest,
    requestDigest: state.requestDigest,
    idempotencyKey: state.idempotencyKey,
    commandId: state.commandId,
    correlationId: state.correlationId,
    ...(state.causationId === undefined ? {} : { causationId: state.causationId }),
    actor: state.actor,
    createdAt: state.createdAt,
  };
  return {
    ...identity,
    schemaVersion: "coding-task-session.closeout-state.v1",
    status: CodingTaskSessionCloseoutStatus.SnapshotPersisted,
    snapshot: currentSnapshot,
    coveredActionIds: [...actionIds],
    actionEvidenceDigest: legacyActionEvidenceDigest(currentSnapshot),
    checkpoint: null,
    stoppedStage: null,
    errorCode: null,
    recoveryGuidance: null,
    version: 1,
    updatedAt: "2026-07-26T00:00:01.000Z",
  };
}

/** 创建携带旧 Coverage Manifest v1 的完整 Closeout State v2 fixture。 */
export function legacyV2PersistedState(
  state: CodingTaskSessionCloseoutState,
  currentSnapshot: CodingTaskSessionChangeSetSnapshot = snapshot(),
): Record<string, unknown> {
  const coverageManifest = legacyCoverageManifestV1(state, currentSnapshot);
  return {
    ...state,
    schemaVersion: "coding-task-session.closeout-state.v2",
    status: CodingTaskSessionCloseoutStatus.SnapshotPersisted,
    snapshot: currentSnapshot,
    coverageManifest,
    coverageBindingDigest: digestOf({
      schemaVersion: "coding-task-session.closeout-coverage-binding.v1",
      snapshotDigest: currentSnapshot.snapshotDigest,
      manifestDigest: coverageManifest.manifestDigest,
    }),
    checkpoint: null,
    stoppedStage: null,
    errorCode: null,
    recoveryGuidance: null,
    version: 1,
    updatedAt: "2026-07-26T00:00:01.000Z",
  };
}

/** 创建尚未持久化证据的旧 Closeout State v2 Closing fixture。 */
export function legacyV2ClosingState(
  state: CodingTaskSessionCloseoutState,
): Record<string, unknown> {
  return {
    ...state,
    schemaVersion: "coding-task-session.closeout-state.v2",
  };
}

/** 创建已绑定 Checkpoint 的旧 Closeout State v2 fixture。 */
export function legacyV2CheckpointBoundState(
  state: CodingTaskSessionCloseoutState,
  currentSnapshot: CodingTaskSessionChangeSetSnapshot = snapshot(),
): Record<string, unknown> {
  return {
    ...legacyV2PersistedState(state, currentSnapshot),
    status: CodingTaskSessionCloseoutStatus.CheckpointBound,
    checkpoint: checkpoint(currentSnapshot),
    version: 2,
    updatedAt: "2026-07-26T00:00:02.000Z",
  };
}

/** 创建停在 SnapshotPersisted 阶段的旧 Closeout State v2 终态 fixture。 */
export function legacyV2TerminalState(
  state: CodingTaskSessionCloseoutState,
  currentSnapshot: CodingTaskSessionChangeSetSnapshot = snapshot(),
): Record<string, unknown> {
  return {
    ...legacyV2PersistedState(state, currentSnapshot),
    status: CodingTaskSessionCloseoutStatus.Blocked,
    stoppedStage: CodingTaskSessionCloseoutStage.SnapshotPersisted,
    errorCode: HarnessErrorCode.PreconditionNotMet,
    recoveryGuidance: "由 Human 复核旧 v2 证据后决定迁移方式",
    version: 2,
    updatedAt: "2026-07-26T00:00:02.000Z",
  };
}

function legacyCoverageManifestV1(
  state: CodingTaskSessionCloseoutState,
  currentSnapshot: CodingTaskSessionChangeSetSnapshot,
): Record<string, unknown> & { readonly manifestDigest: ContentDigest } {
  const input = {
    schemaVersion: "coding-task-session.action-coverage.v1",
    workspaceId: state.workspaceId,
    sessionId: state.sessionId,
    codingTaskId: state.codingTaskId,
    sourceTaskId: state.sourceTaskId,
    repositoryId: state.repositoryId,
    attemptNumber: state.attemptNumber,
    activationBindingDigest: state.activationBindingDigest,
    sessionBindingDigest: state.sessionBindingDigest,
    worktreeId: currentSnapshot.worktreeId,
    worktreeRootDigest: digestOf({ worktreeRoot: "legacy-v2" }),
    executorSessionIdDigest: digestOf({ executorSession: "legacy-v2" }),
    actions: actionIds.map((actionId) => ({
      actionId,
      journalDigest: digestOf({ journal: actionId }),
      traceObservationDigests: [digestOf({ trace: actionId })],
    })),
  } as const;
  return { ...input, manifestDigest: digestOf(input) };
}

export function digestOf(input: unknown): ContentDigest {
  return unwrap(digest.calculate(input));
}

export function unwrap<T>(result: Result<T, HarnessError>): T {
  if (result.status === ResultStatus.Failure) throw result.error;
  return result.value;
}
