import type { ChangeSetCheckpoint } from "#application/changeSetCheckpoint/index.js";
import {
  bindExistingCodingTaskSessionCloseoutRecoveryCheckpoint,
  bindRetriedCodingTaskSessionCloseoutRecoveryCheckpoint,
  CodingTaskSessionCloseoutRecoveryResolution,
  markCodingTaskSessionCloseoutRecoveryExecuting,
  markCodingTaskSessionCloseoutRecoveryOutcomeUnknown,
  markCodingTaskSessionCloseoutRecoveryRetryNotApplied,
  requireHumanForCodingTaskSessionCloseoutRecovery,
  type CodingTaskSessionCloseoutRecoveryState,
} from "#application/codingTaskSessionCloseoutRecovery/index.js";
import { CodingTaskSessionCloseoutRecoveryStateStatus } from "#application/codingTaskSessionCloseoutRecovery/state/index.js";
import {
  block,
  markOutcomeUnknown,
  type CodingTaskSessionCloseoutState,
} from "#application/codingTaskSessionCloseoutState/index.js";
import type {
  CodingTaskSessionCloseoutRecoveryStateStore,
  CodingTaskSessionCloseoutStateStore,
} from "#application/ports/index.js";
import { HarnessErrorCode } from "#common/index.js";
import { parseRepositoryId } from "#domain/workspace/index.js";

import type { CodingTaskSessionEffectiveCloseoutResolverDependencies } from "../../../src/application/codingTaskSessionCloseoutRecovery/effectiveResolver/index.js";
import { approvedRecoveryState } from "../../support/codingTaskSessionCloseoutRecovery/codingTaskSessionCloseoutRecoveryStateFixture.js";
import {
  blockedState,
  checkpoint,
  checkpointBoundState,
  digest,
  digestOf,
  initialState,
  persistedState,
  session,
  snapshot,
  unwrap,
  workspace,
} from "../../support/codingTaskSessionCloseout/index.js";
import { createResolverStoreFixture } from "./storeFixture.js";

export const WORKSPACE_ID = workspace;
export const SESSION_ID = session;
export const OTHER_REPOSITORY_ID = unwrap(parseRepositoryId("other-closeout-repository"));

/** Resolver 测试使用的全部合法原 Closeout 状态。 */
export interface CloseoutStateFixture {
  readonly closing: CodingTaskSessionCloseoutState;
  readonly persisted: CodingTaskSessionCloseoutState;
  readonly blocked: CodingTaskSessionCloseoutState;
  readonly retryableBlocked: CodingTaskSessionCloseoutState;
  readonly outcomeUnknown: CodingTaskSessionCloseoutState;
  readonly checkpointBound: CodingTaskSessionCloseoutState;
  readonly checkpoint: ChangeSetCheckpoint;
}

/** Effective Closeout Resolver 的确定性测试夹具。 */
export interface ResolverFixture {
  readonly closeout: CloseoutStateFixture;
  readonly recovery: CodingTaskSessionCloseoutRecoveryState;
  readonly calls: Record<string, number>;
  readonly closeoutStateStore: CodingTaskSessionCloseoutStateStore<CodingTaskSessionCloseoutState>;
  readonly recoveryStateStore: CodingTaskSessionCloseoutRecoveryStateStore<CodingTaskSessionCloseoutRecoveryState>;
  readonly dependencies: CodingTaskSessionEffectiveCloseoutResolverDependencies;
}

/** Recovery State 合法构造时可覆盖的跨模型身份字段。 */
export interface RecoveryStateFixtureInput {
  readonly closeout: CodingTaskSessionCloseoutState;
  readonly status: CodingTaskSessionCloseoutRecoveryStateStatus;
  readonly checkpoint?: ChangeSetCheckpoint;
  readonly resolution?: CodingTaskSessionCloseoutRecoveryResolution;
  readonly overrides?: Readonly<Record<string, unknown>>;
}

/** 使用真实 factory 与 transition 构造 Resolver 基准夹具。 */
export function createResolverFixture(): ResolverFixture {
  const closeout = createCloseoutStateFixture();
  const recovery = createRecoveryState({
    closeout: closeout.outcomeUnknown,
    status: CodingTaskSessionCloseoutRecoveryStateStatus.CheckpointBound,
    checkpoint: closeout.checkpoint,
  });
  const stores = createResolverStoreFixture(closeout.outcomeUnknown, recovery);
  const dependencies: CodingTaskSessionEffectiveCloseoutResolverDependencies = {
    closeoutStateStore: stores.closeoutStateStore,
    recoveryStateStore: stores.recoveryStateStore,
    digest: stores.digest,
  };
  return { closeout, recovery, ...stores, dependencies };
}

/** 使用真实 Closeout transition 构造全部原状态。 */
export function createCloseoutStateFixture(): CloseoutStateFixture {
  const closing = initialState();
  const currentSnapshot = snapshot();
  const persisted = persistedState(closing, currentSnapshot);
  const blocked = blockedState(persisted, "2026-07-26T00:00:02.000Z");
  const retryableBlocked = unwrap(
    block(
      persisted,
      {
        errorCode: HarnessErrorCode.CodingTaskSessionCloseoutCheckpointNotApplied,
        recoveryGuidance: "已证明 Checkpoint 未应用，可由 Human 决定是否重试。",
        updatedAt: "2026-07-26T00:00:02.000Z",
      },
      digest,
    ),
  );
  const outcomeUnknown = unwrap(
    markOutcomeUnknown(
      persisted,
      {
        errorCode: HarnessErrorCode.IoFailure,
        recoveryGuidance: "等待 Human 复核未知结果。",
        updatedAt: "2026-07-26T00:00:02.000Z",
      },
      digest,
    ),
  );
  return {
    closing,
    persisted,
    blocked,
    retryableBlocked,
    outcomeUnknown,
    checkpointBound: checkpointBoundState(persisted, "2026-07-26T00:00:02.000Z"),
    checkpoint: checkpoint(currentSnapshot),
  };
}

/** 按真实 Recovery 状态机路径构造指定状态。 */
export function createRecoveryState(
  input: RecoveryStateFixtureInput,
): CodingTaskSessionCloseoutRecoveryState {
  const candidate = input.checkpoint ?? checkpoint(snapshot());
  const resolution =
    input.resolution ??
    (input.status === CodingTaskSessionCloseoutRecoveryStateStatus.CheckpointBound
      ? CodingTaskSessionCloseoutRecoveryResolution.BindExisting
      : CodingTaskSessionCloseoutRecoveryResolution.RetryOnce);
  const approved = approvedRecoveryState(resolution, {
    closeoutStateDigest: digestOf(input.closeout),
    closeoutVersion: input.closeout.version,
    preSubmitSnapshotDigest: candidate.preSubmitSnapshotDigest,
    changeSetDigest: candidate.changeSetDigest,
    assessmentCheckpointBindingDigest:
      resolution === CodingTaskSessionCloseoutRecoveryResolution.BindExisting
        ? candidate.bindingDigest
        : null,
    ...input.overrides,
  });
  if (input.status === CodingTaskSessionCloseoutRecoveryStateStatus.Approved) return approved;
  if (input.status === CodingTaskSessionCloseoutRecoveryStateStatus.HumanRequired) {
    return unwrap(
      requireHumanForCodingTaskSessionCloseoutRecovery(
        approved,
        terminal("2026-07-27T00:00:01.000Z"),
        digest,
      ),
    );
  }
  if (
    input.status === CodingTaskSessionCloseoutRecoveryStateStatus.CheckpointBound &&
    resolution === CodingTaskSessionCloseoutRecoveryResolution.BindExisting
  ) {
    return unwrap(
      bindExistingCodingTaskSessionCloseoutRecoveryCheckpoint(
        approved,
        { checkpoint: candidate, updatedAt: "2026-07-27T00:00:01.000Z" },
        digest,
      ),
    );
  }
  const executing = unwrap(
    markCodingTaskSessionCloseoutRecoveryExecuting(
      approved,
      { updatedAt: "2026-07-27T00:00:01.000Z" },
      digest,
    ),
  );
  if (input.status === CodingTaskSessionCloseoutRecoveryStateStatus.Executing) return executing;
  if (input.status === CodingTaskSessionCloseoutRecoveryStateStatus.CheckpointBound) {
    return unwrap(
      bindRetriedCodingTaskSessionCloseoutRecoveryCheckpoint(
        executing,
        { checkpoint: candidate, updatedAt: "2026-07-27T00:00:02.000Z" },
        digest,
      ),
    );
  }
  if (input.status === CodingTaskSessionCloseoutRecoveryStateStatus.RetryNotApplied) {
    return unwrap(
      markCodingTaskSessionCloseoutRecoveryRetryNotApplied(
        executing,
        {
          errorCode: HarnessErrorCode.CodingTaskSessionCloseoutCheckpointNotApplied,
          recoveryGuidance: "已证明 Checkpoint 未应用。",
          updatedAt: "2026-07-27T00:00:02.000Z",
        },
        digest,
      ),
    );
  }
  return unwrap(
    markCodingTaskSessionCloseoutRecoveryOutcomeUnknown(
      executing,
      terminal("2026-07-27T00:00:02.000Z"),
      digest,
    ),
  );
}

/** 构造摘要自洽、但路径顺序与原 Snapshot 不同的 Recovery Checkpoint。 */
export function checkpointWithChangedPaths(base: ChangeSetCheckpoint): ChangeSetCheckpoint {
  const changedPaths = [...base.checkpoint.changedPaths.slice(0, -1), "src/recovery-only.ts"];
  const checkpointDigest = digestOf({
    targetRevision: base.checkpoint.targetRevision,
    changedPaths,
  });
  return rebindCheckpoint({
    ...base,
    checkpoint: { ...base.checkpoint, changedPaths, checkpointDigest },
  });
}

/** 构造摘要自洽、但 Snapshot Digest 与原 Closeout 不同的 Recovery Checkpoint。 */
export function checkpointWithSnapshotDrift(base: ChangeSetCheckpoint): ChangeSetCheckpoint {
  return rebindCheckpoint({
    ...base,
    preSubmitSnapshotDigest: digestOf({ snapshot: "drifted" }),
  });
}

/** 明确模拟原 Closeout Store 绕过严格重建后违反不变量。 */
export function closeoutCheckpointContractViolation(
  state: CodingTaskSessionCloseoutState,
): CodingTaskSessionCloseoutState {
  return { ...state, checkpoint: null };
}

/** 明确模拟 Recovery Store 绕过严格重建后违反不变量。 */
export function recoveryCheckpointContractViolation(
  state: CodingTaskSessionCloseoutRecoveryState,
): CodingTaskSessionCloseoutRecoveryState {
  return { ...state, checkpoint: null };
}

/** 明确模拟 Recovery Store 绕过严格重建后返回未知状态。 */
export function recoveryStatusContractViolation(
  state: CodingTaskSessionCloseoutRecoveryState,
): CodingTaskSessionCloseoutRecoveryState {
  const violated = { ...state };
  Reflect.set(violated, "status", "future_status");
  return violated;
}

function rebindCheckpoint(candidate: ChangeSetCheckpoint): ChangeSetCheckpoint {
  return {
    ...candidate,
    bindingDigest: digestOf({
      schemaVersion: candidate.schemaVersion,
      checkpointDigest: candidate.checkpoint.checkpointDigest,
      changeSetDigest: candidate.changeSetDigest,
      preSubmitSnapshotDigest: candidate.preSubmitSnapshotDigest,
    }),
  };
}

function terminal(updatedAt: string): Readonly<Record<string, unknown>> {
  return {
    errorCode: HarnessErrorCode.CodingTaskSessionCloseoutCheckpointOutcomeUnknown,
    recoveryGuidance: "等待 Human 复核并禁止再次执行。",
    updatedAt,
  };
}
