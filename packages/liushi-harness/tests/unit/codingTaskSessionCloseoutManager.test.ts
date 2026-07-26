import { describe, expect, it } from "vitest";
import { CodingTaskSessionCloseoutStatus } from "../../src/application/codingTaskSessionCloseoutState/index.js";
import { HarnessError, HarnessErrorCode, ResultStatus } from "../../src/common/index.js";
import { ActionOutcome } from "../../src/domain/actionJournal/index.js";
import { GateEvaluationResult } from "../../src/domain/policy/index.js";
import { digestOf, initialState } from "../support/codingTaskSessionCloseout/index.js";
import {
  createCloseoutManagerCommand,
  createCloseoutManagerHarness,
  createCloseoutManagerPayload,
} from "../support/codingTaskSessionCloseoutManager/index.js";
describe("CodingTaskSessionCloseoutManager", () => {
  it("严格拒绝额外 Payload、摘要、Aggregate、版本和时间漂移且无副作用", async () => {
    const harness = createCloseoutManagerHarness();
    const payload = createCloseoutManagerPayload();
    for (const extra of [
      { repositoryRoot: "D:/repo" },
      { worktreeRoot: "D:/worktree" },
      { attempt: 1 },
      { writeSet: ["src/a.ts"] },
      { coverage: {} },
      { checkpoint: {} },
    ]) {
      await expectInvalid(
        harness.manager.execute(createCloseoutManagerCommand({ ...payload, ...extra })),
      );
    }
    await expectInvalid(
      harness.manager.execute(
        createCloseoutManagerCommand(payload, { requestDigest: digestOf({ drift: true }) }),
      ),
    );
    await expectInvalid(
      harness.manager.execute(
        createCloseoutManagerCommand(payload, { aggregateId: "other-session" }),
      ),
    );
    await expectInvalid(
      harness.manager.execute(createCloseoutManagerCommand(payload, { expectedVersion: 1 })),
    );
    await expectInvalid(
      harness.manager.execute(
        createCloseoutManagerCommand(payload, { submittedAt: "2026-07-26T08:00:00+08:00" }),
      ),
    );
    expect(harness.calls.activationLoad).toBe(0);
    expect(harness.calls.lockAcquire).toBe(0);
  });

  it("拒绝非 Activation Agent 和早于 Activation 的命令，不创建 Closeout State", async () => {
    const actorHarness = createCloseoutManagerHarness();
    const actorResult = await actorHarness.manager.execute(
      createCloseoutManagerCommand(undefined, { actorId: "other-agent" }),
    );
    expectFailure(actorResult, HarnessErrorCode.PreconditionNotMet);
    expect(actorHarness.state).toBeNull();
    const timeHarness = createCloseoutManagerHarness();
    const timeResult = await timeHarness.manager.execute(
      createCloseoutManagerCommand(undefined, {
        submittedAt: "2026-07-25T23:59:59.000Z",
      }),
    );
    expectFailure(timeResult, HarnessErrorCode.PreconditionNotMet);
    expect(timeHarness.state).toBeNull();
  });

  it("Gate、Attempt 或 Worktree Root 漂移时在创建 State 前 fail closed", async () => {
    for (const harness of [
      createCloseoutManagerHarness({ gateResult: GateEvaluationResult.Forbidden }),
      createCloseoutManagerHarness({ aggregateAttemptNumber: 2 }),
      createCloseoutManagerHarness({ resolvedWorktreeRoot: "drifted-root" }),
    ]) {
      const result = await harness.manager.execute(createCloseoutManagerCommand());
      expectFailure(result, HarnessErrorCode.PreconditionNotMet);
      expect(harness.state).toBeNull();
    }
  });

  it("在 Repository Lock 内 fresh 到 CheckpointBound，终态重放零副作用", async () => {
    const harness = createCloseoutManagerHarness();
    const command = createCloseoutManagerCommand();
    const first = await harness.manager.execute(command);
    expect(first).toMatchObject({
      status: ResultStatus.Success,
      value: { status: CodingTaskSessionCloseoutStatus.CheckpointBound },
    });
    expect(harness.events).toEqual([
      "activation:locate",
      "lock:acquire",
      "activation:locked",
      "codingTask",
      "binding",
      "root",
      "worktree",
      "state:find",
      "state:create",
      "admission",
      "coverage",
      "snapshot",
      "state:replace:0",
      "checkpoint:execute",
      "checkpoint:inspect",
      "state:replace:1",
      "lock:release",
    ]);
    await harness.manager.execute(command);
    expect(harness.calls).toMatchObject({
      admission: 1,
      coverage: 1,
      snapshot: 1,
      checkpointExecute: 1,
    });
  });

  it("从 SnapshotPersisted 仅恢复 Checkpoint，不重复 Admission、Coverage 或 Snapshot", async () => {
    const harness = createCloseoutManagerHarness({
      checkpointFailures: [new HarnessError(HarnessErrorCode.LockUnavailable, "checkpoint lock")],
    });
    const command = createCloseoutManagerCommand();
    const first = await harness.manager.execute(command);
    expectFailure(first, HarnessErrorCode.LockUnavailable);
    expect(harness.state?.status).toBe(CodingTaskSessionCloseoutStatus.SnapshotPersisted);
    const resumed = await harness.manager.execute(command);
    expect(resumed).toMatchObject({
      status: ResultStatus.Success,
      value: { status: CodingTaskSessionCloseoutStatus.CheckpointBound },
    });
    expect(harness.calls).toMatchObject({
      admission: 1,
      coverage: 1,
      snapshot: 1,
      checkpointExecute: 2,
    });
  });

  it("Coverage 只读暂态失败保留 Closing，重放可以安全继续", async () => {
    const harness = createCloseoutManagerHarness({
      coverageFailures: [new HarnessError(HarnessErrorCode.IoFailure, "coverage read")],
    });
    const command = createCloseoutManagerCommand();
    const first = await harness.manager.execute(command);
    expectFailure(first, HarnessErrorCode.IoFailure);
    expect(harness.state?.status).toBe(CodingTaskSessionCloseoutStatus.Closing);

    const resumed = await harness.manager.execute(command);
    expect(resumed).toMatchObject({
      status: ResultStatus.Success,
      value: { status: CodingTaskSessionCloseoutStatus.CheckpointBound },
    });
    expect(harness.calls.coverage).toBe(2);
    expect(harness.calls.snapshot).toBe(1);
  });

  it("Checkpoint NotApplied 落 Blocked，OutcomeUnknown 和 inspect 失败停止重试", async () => {
    const blockedHarness = createCloseoutManagerHarness({
      checkpointOutcome: ActionOutcome.NotApplied,
    });
    const blocked = await blockedHarness.manager.execute(createCloseoutManagerCommand());
    expect(blocked).toMatchObject({
      status: ResultStatus.Success,
      value: {
        status: CodingTaskSessionCloseoutStatus.Blocked,
        errorCode: HarnessErrorCode.CodingTaskSessionCloseoutCheckpointNotApplied,
      },
    });
    await blockedHarness.manager.execute(createCloseoutManagerCommand());
    expect(blockedHarness.calls.checkpointExecute).toBe(1);
    for (const harness of [
      createCloseoutManagerHarness({ checkpointOutcome: ActionOutcome.OutcomeUnknown }),
      createCloseoutManagerHarness({
        checkpointInspectFailure: new HarnessError(
          HarnessErrorCode.PreconditionNotMet,
          "inspect failed",
        ),
      }),
      createCloseoutManagerHarness({
        checkpointExecuteThrow: new Error("checkpoint throw"),
      }),
    ]) {
      const unknown = await harness.manager.execute(createCloseoutManagerCommand());
      expect(unknown).toMatchObject({
        status: ResultStatus.Success,
        value: {
          status: CodingTaskSessionCloseoutStatus.OutcomeUnknown,
          errorCode: HarnessErrorCode.CodingTaskSessionCloseoutCheckpointOutcomeUnknown,
        },
      });
      await harness.manager.execute(createCloseoutManagerCommand());
      expect(harness.calls.checkpointExecute).toBe(1);
    }
  });

  it("Checkpoint 成功后 State CAS 失败时持久化 OutcomeUnknown", async () => {
    const harness = createCloseoutManagerHarness({
      replaceFailures: {
        1: [new HarnessError(HarnessErrorCode.VersionConflict, "injected")],
      },
    });
    const result = await harness.manager.execute(createCloseoutManagerCommand());
    expect(result).toMatchObject({
      status: ResultStatus.Success,
      value: {
        status: CodingTaskSessionCloseoutStatus.OutcomeUnknown,
        errorCode: HarnessErrorCode.CodingTaskSessionCloseoutCheckpointOutcomeUnknown,
      },
    });
  });

  it("Checkpoint 后绑定与终态持久化均失败时不泄漏可重试 VersionConflict", async () => {
    const harness = createCloseoutManagerHarness({
      replaceFailures: {
        1: [
          new HarnessError(HarnessErrorCode.VersionConflict, "binding"),
          new HarnessError(HarnessErrorCode.IoFailure, "terminal"),
        ],
      },
    });
    const result = await harness.manager.execute(createCloseoutManagerCommand());
    expectFailure(result, HarnessErrorCode.CodingTaskSessionCloseoutCheckpointOutcomeUnknown);
    expect(harness.state?.status).toBe(CodingTaskSessionCloseoutStatus.SnapshotPersisted);
  });

  it("Lock 释放失败把当前命令的活动状态置为 OutcomeUnknown", async () => {
    const harness = createCloseoutManagerHarness({ releaseFailure: true });
    const result = await harness.manager.execute(createCloseoutManagerCommand());
    expectFailure(result, HarnessErrorCode.CodingTaskSessionCloseoutLockReleaseUnknown);
    expect(harness.state).toMatchObject({
      status: CodingTaskSessionCloseoutStatus.OutcomeUnknown,
      errorCode: HarnessErrorCode.CodingTaskSessionCloseoutLockReleaseUnknown,
    });
  });

  it("身份冲突叠加 Lock 释放失败时不改写既有 State", async () => {
    const existing = initialState({
      requestDigest: digestOf({ request: "other-command" }),
    });
    const harness = createCloseoutManagerHarness({
      existingState: existing,
      releaseFailure: true,
    });
    const result = await harness.manager.execute(createCloseoutManagerCommand());
    expectFailure(result, HarnessErrorCode.CodingTaskSessionCloseoutLockReleaseUnknown);
    expect(harness.state).toEqual(existing);
    expect(harness.calls.stateReplace).toBe(0);
  });

  it("pre-lock 端口抛出的 LockUnavailable 保持分类且不获取 Repository Lock", async () => {
    const harness = createCloseoutManagerHarness({
      preLockActivationThrow: new HarnessError(HarnessErrorCode.LockUnavailable, "activation"),
    });
    const result = await harness.manager.execute(createCloseoutManagerCommand());
    expectFailure(result, HarnessErrorCode.LockUnavailable);
    expect(harness.calls.lockAcquire).toBe(0);
    expect(harness.state).toBeNull();
  });

  it("Repository Lock acquire 失败时不创建 State 或执行下游能力", async () => {
    const harness = createCloseoutManagerHarness({
      lockAcquireFailure: new HarnessError(HarnessErrorCode.LockUnavailable, "repository"),
    });
    const result = await harness.manager.execute(createCloseoutManagerCommand());
    expectFailure(result, HarnessErrorCode.LockUnavailable);
    expect(harness.state).toBeNull();
    expect(harness.calls.admission).toBe(0);
    expect(harness.calls.coverage).toBe(0);
    expect(harness.calls.snapshot).toBe(0);
  });
});

async function expectInvalid(
  resultPromise: ReturnType<ReturnType<typeof createCloseoutManagerHarness>["manager"]["execute"]>,
): Promise<void> {
  expectFailure(await resultPromise, HarnessErrorCode.InvalidInput);
}

function expectFailure(
  result: Awaited<
    ReturnType<ReturnType<typeof createCloseoutManagerHarness>["manager"]["execute"]>
  >,
  code: HarnessErrorCode,
): void {
  expect(result).toMatchObject({
    status: ResultStatus.Failure,
    error: { code },
  });
}
