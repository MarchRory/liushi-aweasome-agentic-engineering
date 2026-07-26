import {
  createCodingTaskSessionCloseoutState,
  createCloseoutActionEvidenceDigestInput,
  CodingTaskSessionCloseoutStage,
  CodingTaskSessionCloseoutStatus,
  block,
  persistSnapshot,
  type CodingTaskSessionCloseoutStateInput,
  type CodingTaskSessionCloseoutState,
} from "../../../src/application/codingTaskSessionCloseoutState/index.js";
import { CHANGE_SET_CHECKPOINT_SCHEMA_VERSION } from "../../../src/application/changeSetCheckpoint/index.js";
import {
  CodingTaskSessionChangeKind,
  createCodingTaskSessionChangeSet,
  createCodingTaskSessionChangeSetSnapshot,
  type CodingTaskSessionChangeSetSnapshot,
} from "../../../src/domain/codingTaskSessionChangeSet/index.js";
import { parseActionId, type ActionId } from "../../../src/domain/actionJournal/index.js";
import { parseCodingTaskSessionId } from "../../../src/domain/codingTaskSession/index.js";
import { parseTaskId } from "../../../src/domain/task/index.js";
import { parseCodingTaskId } from "../../../src/domain/codingTask/index.js";
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
      activationBindingDigest: digestOf({ binding: "activation" }),
      sessionBindingDigest: digestOf({ binding: "session" }),
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
        writeSet: ["src/closeout-a.ts", "src/closeout-b.ts"],
      },
      digest,
    ),
  );
}

export function evidenceDigest(
  currentSnapshot: CodingTaskSessionChangeSetSnapshot,
  ids: readonly ActionId[] = actionIds,
): ContentDigest {
  return digestOf(createCloseoutActionEvidenceDigestInput(currentSnapshot.snapshotDigest, ids));
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
  return {
    ...state,
    status: CodingTaskSessionCloseoutStatus.CheckpointBound,
    checkpoint: checkpoint(),
    version: 2,
    updatedAt,
  };
}

export function outcomeUnknownCheckpointBoundState(
  state: CodingTaskSessionCloseoutState,
  updatedAt: string,
): CodingTaskSessionCloseoutState {
  return {
    ...state,
    status: CodingTaskSessionCloseoutStatus.OutcomeUnknown,
    checkpoint: checkpoint(),
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
        coveredActionIds: actionIds,
        actionEvidenceDigest: evidenceDigest(currentSnapshot),
        updatedAt: "2026-07-26T00:00:01.000Z",
      },
      digest,
    ),
  );
}

export function digestOf(input: unknown): ContentDigest {
  return unwrap(digest.calculate(input));
}

export function unwrap<T>(result: Result<T, HarnessError>): T {
  if (result.status === ResultStatus.Failure) throw result.error;
  return result.value;
}
