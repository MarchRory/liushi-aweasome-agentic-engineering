import { describe, expect, it } from "vitest";

import {
  bindCheckpoint,
  block,
  CodingTaskSessionCloseoutStage,
  CodingTaskSessionCloseoutStatus,
  markOutcomeUnknown,
  persistSnapshot,
  rebuildCodingTaskSessionCloseoutState,
  validateCodingTaskSessionCloseoutSuccessor,
  type CodingTaskSessionCloseoutState,
} from "../../src/application/codingTaskSessionCloseoutState/index.js";
import {
  calculateCodingTaskSessionActionCoverageManifestDigest,
  type CodingTaskSessionActionCoverageManifest,
} from "../../src/application/codingTaskSessionActionCoverage/index.js";
import {
  CodingTaskSessionChangeKind,
  createCodingTaskSessionChangeSet,
  createCodingTaskSessionChangeSetSnapshot,
} from "../../src/domain/codingTaskSessionChangeSet/index.js";
import { parseCodingTaskId } from "../../src/domain/codingTask/index.js";
import { parseTaskId } from "../../src/domain/task/index.js";
import { parseRepositoryId, parseWorkspaceId } from "../../src/domain/workspace/index.js";
import { parseCodingTaskSessionId } from "../../src/domain/codingTaskSession/index.js";
import {
  HarnessErrorCode,
  ResultStatus,
  type HarnessError,
  type Result,
} from "../../src/common/index.js";
import {
  checkpoint,
  coverageManifest,
  createdAt,
  digest,
  digestOf,
  initialState,
  repository,
  snapshot,
  unwrap,
} from "../support/codingTaskSessionCloseout/index.js";

describe("CodingTask Session Closeout State v3", () => {
  it("按 Closing、SnapshotPersisted、CheckpointBound 顺序绑定完整 Manifest", () => {
    const closing = initialState();
    const currentSnapshot = snapshot();
    const manifest = coverageManifest();
    const persisted = unwrap(
      persistSnapshot(
        closing,
        {
          snapshot: currentSnapshot,
          coverageManifest: manifest,
          updatedAt: "2026-07-26T00:00:01.000Z",
        },
        digest,
      ),
    );
    const bound = unwrap(
      bindCheckpoint(
        persisted,
        { checkpoint: checkpoint(currentSnapshot), updatedAt: "2026-07-26T00:00:02.000Z" },
        digest,
      ),
    );

    expect(closing).toMatchObject({
      schemaVersion: "coding-task-session.closeout-state.v3",
      status: CodingTaskSessionCloseoutStatus.Closing,
      version: 0,
      coverageManifest: null,
      coverageBindingDigest: null,
    });
    expect(persisted).toMatchObject({
      status: CodingTaskSessionCloseoutStatus.SnapshotPersisted,
      version: 1,
      coverageManifest: manifest,
    });
    expect(persisted.coverageBindingDigest).toMatch(/^sha256:/u);
    expect(persisted).not.toHaveProperty("coveredActionIds");
    expect(persisted).not.toHaveProperty("actionEvidenceDigest");
    expect(bound).toMatchObject({
      status: CodingTaskSessionCloseoutStatus.CheckpointBound,
      version: 2,
      snapshot: currentSnapshot,
      coverageManifest: manifest,
      coverageBindingDigest: persisted.coverageBindingDigest,
      checkpoint: checkpoint(currentSnapshot),
    });
    expect(unwrap(rebuildCodingTaskSessionCloseoutState(bound, digest))).toEqual(bound);
  });

  it("联合验证两个 changedPaths、允许额外未变更 target，并拒绝缺覆盖或越 Write Set", () => {
    const currentSnapshot = snapshot();
    const manifest = coverageManifest();
    const complete = unwrap(
      persistSnapshot(
        initialState(),
        {
          snapshot: currentSnapshot,
          coverageManifest: manifest,
          updatedAt: "2026-07-26T00:00:01.000Z",
        },
        digest,
      ),
    );
    expect(complete.snapshot?.changedPaths).toEqual(["src/closeout-a.ts", "src/closeout-b.ts"]);
    expect(complete.coverageManifest?.actions.flatMap((action) => action.targets)).toContain(
      "src/closeout-extra.ts",
    );

    const missingTargetManifest = manifestWith({
      actions: manifest.actions.map((action, index) =>
        index === 1 ? { ...action, targets: ["src/closeout-extra.ts"] } : action,
      ),
    });
    expectFailure(
      persistSnapshot(
        initialState(),
        {
          snapshot: currentSnapshot,
          coverageManifest: missingTargetManifest,
          updatedAt: "2026-07-26T00:00:01.000Z",
        },
        digest,
      ),
      HarnessErrorCode.PreconditionNotMet,
    );
    expectFailure(
      rebuildCodingTaskSessionCloseoutState(
        {
          ...complete,
          coverageManifest: missingTargetManifest,
          coverageBindingDigest: unwrap(calculateBinding(currentSnapshot, missingTargetManifest)),
        },
        digest,
      ),
      HarnessErrorCode.PreconditionNotMet,
    );

    const outsideWriteSetManifest = manifestWith({
      actions: manifest.actions.map((action, index) =>
        index === 0 ? { ...action, targets: ["src/closeout-a.ts", "src/outside.ts"] } : action,
      ),
    });
    expectFailure(
      persistSnapshot(
        initialState(),
        {
          snapshot: currentSnapshot,
          coverageManifest: outsideWriteSetManifest,
          updatedAt: "2026-07-26T00:00:01.000Z",
        },
        digest,
      ),
      HarnessErrorCode.PreconditionNotMet,
    );
    expectFailure(
      rebuildCodingTaskSessionCloseoutState(
        {
          ...complete,
          coverageManifest: outsideWriteSetManifest,
          coverageBindingDigest: unwrap(calculateBinding(currentSnapshot, outsideWriteSetManifest)),
        },
        digest,
      ),
      HarnessErrorCode.PreconditionNotMet,
    );
  });

  it("Rename 的原路径与目标路径都必须有 Action target", () => {
    const currentSnapshot = renamedSnapshot();
    const completeManifest = manifestWith({
      actions: coverageManifest().actions.map((action, index) =>
        index === 0
          ? { ...action, targets: ["src/rename-source.ts", "src/rename-target.ts"] }
          : { ...action, targets: ["src/closeout-extra.ts"] },
      ),
    });
    expect(currentSnapshot.changedPaths).toEqual(["src/rename-source.ts", "src/rename-target.ts"]);
    const persisted = unwrap(
      persistSnapshot(
        initialState(),
        {
          snapshot: currentSnapshot,
          coverageManifest: completeManifest,
          updatedAt: "2026-07-26T00:00:01.000Z",
        },
        digest,
      ),
    );
    expect(rebuildCodingTaskSessionCloseoutState(persisted, digest).status).toBe(
      ResultStatus.Success,
    );

    for (const target of ["src/rename-source.ts", "src/rename-target.ts"] as const) {
      const incompleteManifest = manifestWith({
        actions: completeManifest.actions.map((action, index) =>
          index === 0 ? { ...action, targets: [target] } : action,
        ),
      });
      expectFailure(
        persistSnapshot(
          initialState(),
          {
            snapshot: currentSnapshot,
            coverageManifest: incompleteManifest,
            updatedAt: "2026-07-26T00:00:01.000Z",
          },
          digest,
        ),
        HarnessErrorCode.PreconditionNotMet,
      );
      expectFailure(
        rebuildCodingTaskSessionCloseoutState(
          {
            ...persisted,
            coverageManifest: incompleteManifest,
            coverageBindingDigest: unwrap(calculateBinding(currentSnapshot, incompleteManifest)),
          },
          digest,
        ),
        HarnessErrorCode.PreconditionNotMet,
      );
    }
  });

  it("Copy 只要求覆盖实际新增的目标路径", () => {
    const currentSnapshot = copiedSnapshot();
    const manifest = manifestWith({
      actions: coverageManifest().actions.map((action, index) =>
        index === 0
          ? { ...action, targets: ["src/copy-target.ts"] }
          : { ...action, targets: ["src/closeout-extra.ts"] },
      ),
    });

    expect(currentSnapshot.changedPaths).toEqual(["src/copy-target.ts"]);
    expect(
      persistSnapshot(
        initialState(),
        {
          snapshot: currentSnapshot,
          coverageManifest: manifest,
          updatedAt: "2026-07-26T00:00:01.000Z",
        },
        digest,
      ).status,
    ).toBe(ResultStatus.Success);
  });

  it.each([
    [CodingTaskSessionCloseoutStatus.Closing, 1, CodingTaskSessionCloseoutStage.Closing],
    [
      CodingTaskSessionCloseoutStatus.SnapshotPersisted,
      2,
      CodingTaskSessionCloseoutStage.SnapshotPersisted,
    ],
    [
      CodingTaskSessionCloseoutStatus.CheckpointBound,
      3,
      CodingTaskSessionCloseoutStage.CheckpointBound,
    ],
  ] as const)("从 %s 进入 Blocked 时保留对应证据和版本", (_status, version, stage) => {
    const stopped = unwrap(
      block(
        stateAt(_status),
        {
          errorCode: HarnessErrorCode.PreconditionNotMet,
          recoveryGuidance: "人工复核 Closeout 证据",
          updatedAt: `2026-07-26T00:00:0${version}.000Z`,
        },
        digest,
      ),
    );
    expect(stopped).toMatchObject({
      status: CodingTaskSessionCloseoutStatus.Blocked,
      version,
      stoppedStage: stage,
    });
    expect(stopped.coverageManifest).toEqual(
      _status === CodingTaskSessionCloseoutStatus.Closing ? null : coverageManifest(),
    );
  });

  it("从各活动阶段进入 OutcomeUnknown 后不能再次推进", () => {
    for (const status of Object.values(CodingTaskSessionCloseoutStatus).slice(0, 3)) {
      const stopped = unwrap(
        markOutcomeUnknown(
          stateAt(status),
          {
            errorCode: HarnessErrorCode.IoFailure,
            recoveryGuidance: "等待外部结果确认",
            updatedAt: "2026-07-26T00:00:04.000Z",
          },
          digest,
        ),
      );
      expect(stopped.status).toBe(CodingTaskSessionCloseoutStatus.OutcomeUnknown);
      expect(
        markOutcomeUnknown(
          stopped,
          {
            errorCode: HarnessErrorCode.IoFailure,
            recoveryGuidance: "停止",
            updatedAt: "2026-07-26T00:00:05.000Z",
          },
          digest,
        ).status,
      ).toBe(ResultStatus.Failure);
    }
  });

  it.each([
    ["workspaceId", unwrap(parseWorkspaceId("other-workspace"))],
    ["sessionId", unwrap(parseCodingTaskSessionId("01ARZ3NDEKTSV4RRFFQ69G5FAZ"))],
    ["codingTaskId", unwrap(parseCodingTaskId("other-coding-task"))],
    ["sourceTaskId", unwrap(parseTaskId("01ARZ3NDEKTSV4RRFFQ69G5FB0"))],
    ["repositoryId", unwrap(parseRepositoryId("other-repository"))],
    ["attemptNumber", 2],
    ["activationBindingDigest", digestOf({ binding: "other-activation" })],
    ["sessionBindingDigest", digestOf({ binding: "other-session" })],
  ] as const)("拒绝 Manifest %s identity 漂移", (field, value) => {
    const result = persistSnapshot(
      initialState(),
      {
        snapshot: snapshot(),
        coverageManifest: manifestWith({ [field]: value }),
        updatedAt: "2026-07-26T00:00:01.000Z",
      },
      digest,
    );
    expectFailure(result, HarnessErrorCode.PreconditionNotMet);
  });

  it.each(["repositoryId", "worktreeId"] as const)("拒绝 Snapshot %s 漂移", (field) => {
    const current = snapshot();
    const changed = snapshotWith(
      field === "repositoryId" ? unwrap(parseRepositoryId("other-repository")) : repository,
      field === "worktreeId" ? "other-worktree" : current.worktreeId,
    );
    expectFailure(
      persistSnapshot(
        initialState(),
        {
          snapshot: changed,
          coverageManifest: coverageManifest(),
          updatedAt: "2026-07-26T00:00:01.000Z",
        },
        digest,
      ),
      HarnessErrorCode.PreconditionNotMet,
    );
  });

  it("拒绝 Manifest digest、外层 binding、action 排序和未知字段篡改", () => {
    const base = initialState();
    const currentSnapshot = snapshot();
    const manifest = coverageManifest();
    const persisted = unwrap(
      persistSnapshot(
        base,
        {
          snapshot: currentSnapshot,
          coverageManifest: manifest,
          updatedAt: "2026-07-26T00:00:01.000Z",
        },
        digest,
      ),
    );
    expectFailure(
      persistSnapshot(
        base,
        {
          snapshot: currentSnapshot,
          coverageManifest: { ...manifest, manifestDigest: digestOf("manifest-drift") },
          updatedAt: "2026-07-26T00:00:01.000Z",
        },
        digest,
      ),
      HarnessErrorCode.PreconditionNotMet,
    );
    expectFailure(
      rebuildCodingTaskSessionCloseoutState(
        { ...persisted, coverageBindingDigest: digestOf("binding-drift") },
        digest,
      ),
      HarnessErrorCode.PreconditionNotMet,
    );
    expectFailure(
      persistSnapshot(
        base,
        {
          snapshot: currentSnapshot,
          coverageManifest: manifestWith({ actions: [...manifest.actions].reverse() }),
          updatedAt: "2026-07-26T00:00:01.000Z",
        },
        digest,
      ),
      HarnessErrorCode.PreconditionNotMet,
    );
    expectFailure(
      persistSnapshot(
        base,
        {
          snapshot: currentSnapshot,
          coverageManifest: manifestWith({
            extra: true,
          }),
          updatedAt: "2026-07-26T00:00:01.000Z",
        },
        digest,
      ),
      HarnessErrorCode.PreconditionNotMet,
    );
  });

  it("拒绝 successor 替换完整 Manifest 或 binding", () => {
    const persisted = stateAt(CodingTaskSessionCloseoutStatus.SnapshotPersisted);
    const bound = unwrap(
      bindCheckpoint(
        persisted,
        { checkpoint: checkpoint(snapshot()), updatedAt: "2026-07-26T00:00:02.000Z" },
        digest,
      ),
    );
    const terminal = unwrap(
      block(
        bound,
        {
          errorCode: HarnessErrorCode.PreconditionNotMet,
          recoveryGuidance: "人工复核",
          updatedAt: "2026-07-26T00:00:03.000Z",
        },
        digest,
      ),
    );
    const replacement = manifestWith({ executorSessionIdDigest: digestOf("replacement") });
    const candidate = {
      ...terminal,
      coverageManifest: replacement,
      coverageBindingDigest: unwrap(calculateBinding(terminal.snapshot!, replacement)),
    } as CodingTaskSessionCloseoutState;
    expectFailure(
      validateCodingTaskSessionCloseoutSuccessor(bound, candidate, digest),
      HarnessErrorCode.InvalidStateTransition,
    );
  });

  it("拒绝旧字段、跳过阶段和倒退时间", () => {
    const base = initialState();
    expectFailure(
      rebuildCodingTaskSessionCloseoutState({ ...base, coveredActionIds: [] }, digest),
      HarnessErrorCode.InvalidInput,
    );
    expectFailure(
      rebuildCodingTaskSessionCloseoutState(
        { ...base, status: CodingTaskSessionCloseoutStatus.SnapshotPersisted },
        digest,
      ),
      HarnessErrorCode.InvalidStateTransition,
    );
    expectFailure(
      persistSnapshot(
        stateAt(CodingTaskSessionCloseoutStatus.SnapshotPersisted),
        { snapshot: snapshot(), coverageManifest: coverageManifest(), updatedAt: createdAt },
        digest,
      ),
      HarnessErrorCode.InvalidStateTransition,
    );
  });
});

function stateAt(status: CodingTaskSessionCloseoutStatus): CodingTaskSessionCloseoutState {
  const base = initialState();
  if (status === CodingTaskSessionCloseoutStatus.Closing) return base;
  const currentSnapshot = snapshot();
  const persisted = unwrap(
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
  return status === CodingTaskSessionCloseoutStatus.SnapshotPersisted
    ? persisted
    : unwrap(
        bindCheckpoint(
          persisted,
          { checkpoint: checkpoint(currentSnapshot), updatedAt: "2026-07-26T00:00:02.000Z" },
          digest,
        ),
      );
}

function manifestWith(changes: Record<string, unknown>): CodingTaskSessionActionCoverageManifest {
  const candidate = {
    ...coverageManifest(),
    ...changes,
  } as CodingTaskSessionActionCoverageManifest;
  return {
    ...candidate,
    manifestDigest: unwrap(
      calculateCodingTaskSessionActionCoverageManifestDigest(candidate, digest),
    ),
  };
}

function snapshotWith(repositoryId: typeof repository, worktreeId: string) {
  const current = snapshot();
  const changeSet = unwrap(
    createCodingTaskSessionChangeSet(
      {
        repositoryId,
        baseRevision: current.baseRevision,
        changes: current.changes,
      },
      digest,
    ),
  );
  return unwrap(
    createCodingTaskSessionChangeSetSnapshot(
      {
        changeSet,
        worktreeId,
        worktreeRelativePath: current.worktreeRelativePath,
        branchName: current.branchName,
        observedHeadRevision: current.observedHeadRevision,
        writeSet: current.writeSet,
      },
      digest,
    ),
  );
}

function renamedSnapshot() {
  const changeSet = unwrap(
    createCodingTaskSessionChangeSet(
      {
        repositoryId: repository,
        baseRevision: "a".repeat(40),
        changes: [
          {
            path: "src/rename-target.ts",
            originalPath: "src/rename-source.ts",
            kind: CodingTaskSessionChangeKind.Renamed,
            targetContentDigest: digestOf({ content: "rename" }),
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
        writeSet: ["src/closeout-extra.ts", "src/rename-source.ts", "src/rename-target.ts"],
      },
      digest,
    ),
  );
}

function copiedSnapshot() {
  const changeSet = unwrap(
    createCodingTaskSessionChangeSet(
      {
        repositoryId: repository,
        baseRevision: "a".repeat(40),
        changes: [
          {
            path: "src/copy-target.ts",
            originalPath: "src/copy-source.ts",
            kind: CodingTaskSessionChangeKind.Copied,
            targetContentDigest: digestOf({ content: "copy" }),
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
        writeSet: ["src/closeout-extra.ts", "src/copy-target.ts"],
      },
      digest,
    ),
  );
}

function calculateBinding(
  currentSnapshot: NonNullable<CodingTaskSessionCloseoutState["snapshot"]>,
  manifest: CodingTaskSessionActionCoverageManifest,
) {
  return digest.calculate({
    schemaVersion: "coding-task-session.closeout-coverage-binding.v1",
    snapshotDigest: currentSnapshot.snapshotDigest,
    manifestDigest: manifest.manifestDigest,
  });
}

function expectFailure(result: Result<unknown, HarnessError>, code: HarnessErrorCode): void {
  expect(result.status).toBe(ResultStatus.Failure);
  if (result.status === ResultStatus.Failure) expect(result.error.code).toBe(code);
}
