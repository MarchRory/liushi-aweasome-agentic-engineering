import { describe, expect, it, vi } from "vitest";

import {
  CodingTaskSessionEffectiveCloseoutResolver,
  CodingTaskSessionEffectiveCloseoutSource,
  CodingTaskSessionEffectiveCloseoutStatus,
  CodingTaskSessionEffectiveCloseoutUnresolvedReason,
} from "#application/codingTaskSessionCloseoutRecovery/effectiveResolver/index.js";
import { CodingTaskSessionCloseoutRecoveryStateStatus } from "#application/codingTaskSessionCloseoutRecovery/state/index.js";
import { HarnessErrorCode, ResultStatus, success } from "#common/index.js";

import {
  OTHER_REPOSITORY_ID,
  SESSION_ID,
  WORKSPACE_ID,
  checkpointWithChangedPaths,
  checkpointWithSnapshotDrift,
  closeoutCheckpointContractViolation,
  createRecoveryState,
  createResolverFixture,
  recoveryCheckpointContractViolation,
  type ResolverFixture,
} from "./fixture.js";
import { digestOf } from "../../support/codingTaskSessionCloseout/index.js";

const INPUT = { workspaceId: WORKSPACE_ID, sessionId: SESSION_ID };

function createResolver(fixture: ResolverFixture) {
  return new CodingTaskSessionEffectiveCloseoutResolver(fixture.dependencies);
}

function expectUnresolved(
  result: Awaited<ReturnType<CodingTaskSessionEffectiveCloseoutResolver["resolve"]>>,
  reason: CodingTaskSessionEffectiveCloseoutUnresolvedReason,
): void {
  expect(result.status).toBe(ResultStatus.Success);
  if (result.status === ResultStatus.Success) {
    expect(result.value).toEqual({
      status: CodingTaskSessionEffectiveCloseoutStatus.Unresolved,
      reason,
    });
  }
}

function expectFailureCode(
  result: Awaited<ReturnType<CodingTaskSessionEffectiveCloseoutResolver["resolve"]>>,
  code: HarnessErrorCode,
): void {
  expect(result.status).toBe(ResultStatus.Failure);
  if (result.status === ResultStatus.Failure) expect(result.error.code).toBe(code);
}

describe("CodingTaskSessionEffectiveCloseoutResolver", () => {
  it.each([
    null,
    {},
    { workspaceId: WORKSPACE_ID },
    { sessionId: SESSION_ID },
    { workspaceId: WORKSPACE_ID, sessionId: SESSION_ID, extra: true },
    { workspaceId: "bad value", sessionId: SESSION_ID },
    { workspaceId: WORKSPACE_ID, sessionId: "not-a-session" },
  ])("拒绝非严格输入 %#", async (input) => {
    const fixture = createResolverFixture();
    const result = await createResolver(fixture).resolve(input);
    expectFailureCode(result, HarnessErrorCode.InvalidInput);
    expect(fixture.calls).toEqual({});
  });

  it("原 CheckpointBound 优先，且不查询 Recovery 或计算摘要", async () => {
    const fixture = createResolverFixture();
    vi.spyOn(fixture.closeoutStateStore, "load").mockResolvedValue(
      success(fixture.closeout.checkpointBound),
    );
    const result = await createResolver(fixture).resolve(INPUT);
    expect(result).toEqual(
      success({
        status: CodingTaskSessionEffectiveCloseoutStatus.Resolved,
        source: CodingTaskSessionEffectiveCloseoutSource.Original,
        checkpoint: fixture.closeout.checkpoint,
      }),
    );
    expect(fixture.calls["recovery.find"] ?? 0).toBe(0);
    expect(fixture.calls["digest.calculate"] ?? 0).toBe(0);
  });

  it("原 CheckpointBound 缺少 checkpoint 时报告 CorruptStore", async () => {
    const fixture = createResolverFixture();
    vi.spyOn(fixture.closeoutStateStore, "load").mockResolvedValue(
      success(closeoutCheckpointContractViolation(fixture.closeout.checkpointBound)),
    );
    const result = await createResolver(fixture).resolve(INPUT);
    expectFailureCode(result, HarnessErrorCode.CorruptStore);
    expect(fixture.calls["recovery.find"] ?? 0).toBe(0);
    expect(fixture.calls["digest.calculate"] ?? 0).toBe(0);
  });

  it.each(["closing", "persisted"] as const)("原 %s 非终态时不查询 Recovery", async (key) => {
    const fixture = createResolverFixture();
    vi.spyOn(fixture.closeoutStateStore, "load").mockResolvedValue(success(fixture.closeout[key]));
    const result = await createResolver(fixture).resolve(INPUT);
    expectUnresolved(
      result,
      CodingTaskSessionEffectiveCloseoutUnresolvedReason.CloseoutNotTerminal,
    );
    expect(fixture.calls["recovery.find"] ?? 0).toBe(0);
    expect(fixture.calls["digest.calculate"] ?? 0).toBe(0);
  });

  it.each(["blocked", "outcomeUnknown"] as const)(
    "原 %s 终态可查询到 RecoveryMissing",
    async (key) => {
      const fixture = createResolverFixture();
      vi.spyOn(fixture.closeoutStateStore, "load").mockResolvedValue(
        success(fixture.closeout[key]),
      );
      const recoveryFind = vi
        .spyOn(fixture.recoveryStateStore, "find")
        .mockResolvedValue(success(null));
      const result = await createResolver(fixture).resolve(INPUT);
      expectUnresolved(result, CodingTaskSessionEffectiveCloseoutUnresolvedReason.RecoveryMissing);
      expect(recoveryFind).toHaveBeenCalledTimes(1);
      expect(fixture.calls["digest.calculate"] ?? 0).toBe(0);
    },
  );

  it.each([
    [
      CodingTaskSessionCloseoutRecoveryStateStatus.Approved,
      CodingTaskSessionEffectiveCloseoutUnresolvedReason.RecoveryNonTerminal,
    ],
    [
      CodingTaskSessionCloseoutRecoveryStateStatus.Executing,
      CodingTaskSessionEffectiveCloseoutUnresolvedReason.RecoveryNonTerminal,
    ],
    [
      CodingTaskSessionCloseoutRecoveryStateStatus.RetryNotApplied,
      CodingTaskSessionEffectiveCloseoutUnresolvedReason.RecoveryCheckpointUnavailable,
    ],
    [
      CodingTaskSessionCloseoutRecoveryStateStatus.OutcomeUnknown,
      CodingTaskSessionEffectiveCloseoutUnresolvedReason.RecoveryCheckpointUnavailable,
    ],
    [
      CodingTaskSessionCloseoutRecoveryStateStatus.HumanRequired,
      CodingTaskSessionEffectiveCloseoutUnresolvedReason.RecoveryCheckpointUnavailable,
    ],
  ])("合法 Recovery 状态 %s 返回稳定原因", async (status, reason) => {
    const fixture = createResolverFixture();
    const recovery = createRecoveryState({
      closeout: fixture.closeout.retryableBlocked,
      status,
    });
    vi.spyOn(fixture.closeoutStateStore, "load").mockResolvedValue(
      success(fixture.closeout.retryableBlocked),
    );
    vi.spyOn(fixture.recoveryStateStore, "find").mockResolvedValue(success(recovery));
    const result = await createResolver(fixture).resolve(INPUT);
    expectUnresolved(result, reason);
    expect(fixture.calls["digest.calculate"] ?? 0).toBe(0);
  });

  it("Recovery CheckpointBound 缺少 checkpoint 时报告 CorruptStore", async () => {
    const fixture = createResolverFixture();
    vi.spyOn(fixture.recoveryStateStore, "find").mockResolvedValue(
      success(recoveryCheckpointContractViolation(fixture.recovery)),
    );
    const result = await createResolver(fixture).resolve(INPUT);
    expectFailureCode(result, HarnessErrorCode.CorruptStore);
    expect(fixture.calls["digest.calculate"] ?? 0).toBe(0);
  });

  it("身份漂移在摘要计算前返回 IdentityMismatch", async () => {
    const fixture = createResolverFixture();
    const recovery = createRecoveryState({
      closeout: fixture.closeout.outcomeUnknown,
      status: CodingTaskSessionCloseoutRecoveryStateStatus.CheckpointBound,
      checkpoint: fixture.closeout.checkpoint,
      overrides: { repositoryId: OTHER_REPOSITORY_ID },
    });
    vi.spyOn(fixture.recoveryStateStore, "find").mockResolvedValue(success(recovery));
    const result = await createResolver(fixture).resolve(INPUT);
    expectUnresolved(result, CodingTaskSessionEffectiveCloseoutUnresolvedReason.IdentityMismatch);
    expect(fixture.calls["digest.calculate"] ?? 0).toBe(0);
  });

  it("closeoutVersion 漂移在摘要计算前返回 CloseoutBindingMismatch", async () => {
    const fixture = createResolverFixture();
    const recovery = createRecoveryState({
      closeout: fixture.closeout.outcomeUnknown,
      status: CodingTaskSessionCloseoutRecoveryStateStatus.CheckpointBound,
      checkpoint: fixture.closeout.checkpoint,
      overrides: { closeoutVersion: fixture.closeout.outcomeUnknown.version + 1 },
    });
    vi.spyOn(fixture.recoveryStateStore, "find").mockResolvedValue(success(recovery));
    const result = await createResolver(fixture).resolve(INPUT);
    expectUnresolved(
      result,
      CodingTaskSessionEffectiveCloseoutUnresolvedReason.CloseoutBindingMismatch,
    );
    expect(fixture.calls["digest.calculate"] ?? 0).toBe(0);
  });

  it("完整 State Digest 漂移返回 CloseoutBindingMismatch", async () => {
    const fixture = createResolverFixture();
    const recovery = createRecoveryState({
      closeout: fixture.closeout.outcomeUnknown,
      status: CodingTaskSessionCloseoutRecoveryStateStatus.CheckpointBound,
      checkpoint: fixture.closeout.checkpoint,
      overrides: { closeoutStateDigest: digestOf({ closeout: "drifted" }) },
    });
    vi.spyOn(fixture.recoveryStateStore, "find").mockResolvedValue(success(recovery));
    const result = await createResolver(fixture).resolve(INPUT);
    expectUnresolved(
      result,
      CodingTaskSessionEffectiveCloseoutUnresolvedReason.CloseoutBindingMismatch,
    );
    expect(fixture.calls["digest.calculate"]).toBe(1);
  });

  it("Snapshot 摘要漂移返回 SnapshotBindingMismatch", async () => {
    const fixture = createResolverFixture();
    const drifted = checkpointWithSnapshotDrift(fixture.closeout.checkpoint);
    const recovery = createRecoveryState({
      closeout: fixture.closeout.outcomeUnknown,
      status: CodingTaskSessionCloseoutRecoveryStateStatus.CheckpointBound,
      checkpoint: drifted,
    });
    vi.spyOn(fixture.recoveryStateStore, "find").mockResolvedValue(success(recovery));
    const result = await createResolver(fixture).resolve(INPUT);
    expectUnresolved(
      result,
      CodingTaskSessionEffectiveCloseoutUnresolvedReason.SnapshotBindingMismatch,
    );
    expect(fixture.calls["digest.calculate"]).toBe(1);
  });

  it("Recovery 路径顺序与原 Snapshot 不一致时返回 CheckpointBindingMismatch", async () => {
    const fixture = createResolverFixture();
    const drifted = checkpointWithChangedPaths(fixture.closeout.checkpoint);
    const recovery = createRecoveryState({
      closeout: fixture.closeout.outcomeUnknown,
      status: CodingTaskSessionCloseoutRecoveryStateStatus.CheckpointBound,
      checkpoint: drifted,
    });
    vi.spyOn(fixture.recoveryStateStore, "find").mockResolvedValue(success(recovery));
    const result = await createResolver(fixture).resolve(INPUT);
    expectUnresolved(
      result,
      CodingTaskSessionEffectiveCloseoutUnresolvedReason.CheckpointBindingMismatch,
    );
    expect(fixture.calls["digest.calculate"]).toBe(1);
  });

  it("成功解析 OutcomeUnknown + BindExisting Recovery Checkpoint", async () => {
    const fixture = createResolverFixture();
    const result = await createResolver(fixture).resolve(INPUT);
    expect(result).toEqual(
      success({
        status: CodingTaskSessionEffectiveCloseoutStatus.Resolved,
        source: CodingTaskSessionEffectiveCloseoutSource.Recovery,
        checkpoint: fixture.closeout.checkpoint,
      }),
    );
    expect(fixture.calls["closeout.load"]).toBe(1);
    expect(fixture.calls["recovery.find"]).toBe(1);
    expect(fixture.calls["digest.calculate"]).toBe(1);
    for (const name of [
      "closeout.create",
      "closeout.find",
      "closeout.replace",
      "recovery.create",
      "recovery.load",
      "recovery.replace",
    ]) {
      expect(fixture.calls[name] ?? 0).toBe(0);
    }
  });
});
