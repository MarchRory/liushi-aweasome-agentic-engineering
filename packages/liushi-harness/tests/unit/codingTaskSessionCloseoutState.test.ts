import { describe, expect, it } from "vitest";

import {
  bindCheckpoint,
  block,
  CodingTaskSessionCloseoutStage,
  CodingTaskSessionCloseoutStatus,
  markOutcomeUnknown,
  persistSnapshot,
  rebuildCodingTaskSessionCloseoutState,
} from "../../src/application/codingTaskSessionCloseoutState/index.js";
import type { ChangeSetCheckpoint } from "../../src/application/changeSetCheckpoint/index.js";
import { HarnessErrorCode, ResultStatus } from "../../src/common/index.js";
import {
  actionIds,
  checkpoint,
  digest,
  evidenceDigest,
  digestOf,
  initialState,
  snapshot,
  unwrap,
} from "../support/codingTaskSessionCloseout/index.js";

describe("CodingTaskSession Closeout State", () => {
  it("按 Closing、SnapshotPersisted、CheckpointBound 顺序推进并稳定重建证据", () => {
    const closing = initialState();
    const currentSnapshot = snapshot();
    const persisted = unwrap(
      persistSnapshot(
        closing,
        {
          snapshot: currentSnapshot,
          coveredActionIds: [...actionIds].reverse(),
          actionEvidenceDigest: evidenceDigest(currentSnapshot),
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

    expect(persisted).toMatchObject({
      status: CodingTaskSessionCloseoutStatus.SnapshotPersisted,
      version: 1,
      coveredActionIds: [...actionIds],
    });
    expect(bound).toMatchObject({
      status: CodingTaskSessionCloseoutStatus.CheckpointBound,
      version: 2,
      snapshot: currentSnapshot,
      checkpoint: checkpoint(currentSnapshot),
    });
    expect(unwrap(rebuildCodingTaskSessionCloseoutState(bound, digest))).toEqual(bound);
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
  ] as const)("从 %s 进入 Blocked 时保留前态、版本和 stoppedStage", (_status, version, stage) => {
    const current = stateAt(_status);
    const stopped = unwrap(
      block(
        current,
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
    expect(
      block(
        stopped,
        {
          errorCode: HarnessErrorCode.IoFailure,
          recoveryGuidance: "停止",
          updatedAt: "2026-07-26T00:00:04.000Z",
        },
        digest,
      ).status,
    ).toBe(ResultStatus.Failure);
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
  ] as const)(
    "从 %s 进入 OutcomeUnknown 后保留版本和 stoppedStage 且不可再次推进",
    (status, version, stage) => {
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
      expect(stopped).toMatchObject({
        status: CodingTaskSessionCloseoutStatus.OutcomeUnknown,
        version,
        stoppedStage: stage,
      });
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
    },
  );

  it("拒绝重复 Action ID、摘要漂移、路径或时间错误以及未知字段", () => {
    const currentSnapshot = snapshot();
    const base = initialState();
    const duplicate = persistSnapshot(
      base,
      {
        snapshot: currentSnapshot,
        coveredActionIds: [actionIds[0], actionIds[0]],
        actionEvidenceDigest: evidenceDigest(currentSnapshot),
        updatedAt: "2026-07-26T00:00:01.000Z",
      },
      digest,
    );
    const drift = persistSnapshot(
      base,
      {
        snapshot: currentSnapshot,
        coveredActionIds: actionIds,
        actionEvidenceDigest: evidenceDigest(currentSnapshot, [actionIds[0]]),
        updatedAt: "2026-07-26T00:00:01.000Z",
      },
      digest,
    );
    expect(duplicate.status).toBe(ResultStatus.Failure);
    expect(drift.status).toBe(ResultStatus.Failure);

    const malformedSnapshot = { ...currentSnapshot, writeSet: ["src/other.ts"] };
    expect(
      persistSnapshot(
        base,
        {
          snapshot: malformedSnapshot,
          coveredActionIds: actionIds,
          actionEvidenceDigest: evidenceDigest(currentSnapshot),
          updatedAt: "2026-07-26T00:00:01.000Z",
        },
        digest,
      ).status,
    ).toBe(ResultStatus.Failure);

    const persisted = unwrap(
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
    expect(
      bindCheckpoint(
        persisted,
        {
          checkpoint: checkpoint(currentSnapshot),
          updatedAt: "2026-07-26T00:00:00.000Z",
        },
        digest,
      ).status,
    ).toBe(ResultStatus.Failure);
    const badCheckpoint = {
      ...checkpoint(currentSnapshot),
      preSubmitSnapshotDigest: digestOf("wrong"),
    };
    expect(
      bindCheckpoint(
        persisted,
        { checkpoint: badCheckpoint, updatedAt: "2026-07-26T00:00:02.000Z" },
        digest,
      ).status,
    ).toBe(ResultStatus.Failure);
    const pathCheckpoint = checkpoint(currentSnapshot);
    const mismatchedPaths = ["src/closeout-a.ts", "src/other.ts"] as const;
    const pathDigest = digestOf({
      targetRevision: pathCheckpoint.checkpoint.targetRevision,
      changedPaths: mismatchedPaths,
    });
    const pathBinding = digestOf({
      schemaVersion: pathCheckpoint.schemaVersion,
      checkpointDigest: pathDigest,
      changeSetDigest: pathCheckpoint.changeSetDigest,
      preSubmitSnapshotDigest: pathCheckpoint.preSubmitSnapshotDigest,
    });
    const mismatchedCheckpoint: ChangeSetCheckpoint = {
      schemaVersion: pathCheckpoint.schemaVersion,
      checkpoint: {
        targetRevision: pathCheckpoint.checkpoint.targetRevision,
        changedPaths: [...mismatchedPaths],
        checkpointDigest: pathDigest,
      },
      changeSetDigest: pathCheckpoint.changeSetDigest,
      preSubmitSnapshotDigest: pathCheckpoint.preSubmitSnapshotDigest,
      bindingDigest: pathBinding,
    };
    expect(
      bindCheckpoint(
        persisted,
        {
          checkpoint: mismatchedCheckpoint,
          updatedAt: "2026-07-26T00:00:02.000Z",
        },
        digest,
      ).status,
    ).toBe(ResultStatus.Failure);
    expect(rebuildCodingTaskSessionCloseoutState({ ...base, version: 1 }, digest).status).toBe(
      ResultStatus.Failure,
    );
    expect(
      rebuildCodingTaskSessionCloseoutState(
        { ...base, status: CodingTaskSessionCloseoutStatus.SnapshotPersisted },
        digest,
      ).status,
    ).toBe(ResultStatus.Failure);
    expect(
      rebuildCodingTaskSessionCloseoutState({ ...base, errorCode: "future_error" }, digest).status,
    ).toBe(ResultStatus.Failure);
    expect(
      rebuildCodingTaskSessionCloseoutState({ ...base, unexpected: true }, digest).status,
    ).toBe(ResultStatus.Failure);
  });
});

function stateAt(status: CodingTaskSessionCloseoutStatus) {
  const base = initialState();
  if (status === CodingTaskSessionCloseoutStatus.Closing) return base;
  const currentSnapshot = snapshot();
  const persisted = unwrap(
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
