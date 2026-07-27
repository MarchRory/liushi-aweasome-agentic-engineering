import { describe, expect, it } from "vitest";

import { ChangeSetCheckpointRecoveryStatus } from "../../src/application/changeSetCheckpoint/index.js";
import { CodingTaskSessionCloseoutRecoveryStateStatus } from "../../src/application/codingTaskSessionCloseoutRecovery/index.js";
import { CodingTaskSessionCloseoutRecoveryStateCreateDisposition } from "../../src/application/ports/index.js";
import { HarnessError, HarnessErrorCode, ResultStatus } from "../../src/common/index.js";
import { ActionOutcome } from "../../src/domain/actionJournal/index.js";
import {
  approvedState,
  createRecoveryHandlerHarness,
  executingState,
  mismatchedCheckpoint,
} from "../support/codingTaskSessionCloseoutRecoveryHandler/index.js";
import { checkpoint } from "../support/codingTaskSessionCloseout/index.js";

describe("CodingTaskSessionCloseoutRecoveryCommandHandler failures", () => {
  it.each([
    {
      name: "NotApplied",
      executeOutcome: ActionOutcome.NotApplied,
      status: CodingTaskSessionCloseoutRecoveryStateStatus.RetryNotApplied,
    },
    {
      name: "OutcomeUnknown",
      executeOutcome: ActionOutcome.OutcomeUnknown,
      status: CodingTaskSessionCloseoutRecoveryStateStatus.OutcomeUnknown,
    },
    {
      name: "inspect failure",
      inspectFailure: new HarnessError(HarnessErrorCode.IoFailure, "inspect"),
      status: CodingTaskSessionCloseoutRecoveryStateStatus.OutcomeUnknown,
    },
  ])("RetryOnce $name 闭合到安全终态", async ({ executeOutcome, inspectFailure, status }) => {
    const harness = createRecoveryHandlerHarness({
      ...(executeOutcome === undefined ? {} : { executeOutcome }),
      ...(inspectFailure === undefined ? {} : { inspectFailure }),
    });
    const result = await harness.handler.execute(harness.command);

    expect(result.status).toBe(ResultStatus.Failure);
    expect(harness.state?.status).toBe(status);
    expect(harness.calls.execute).toBe(1);
    const replay = await harness.handler.execute(harness.command);
    expect(replay.status).toBe(ResultStatus.Failure);
    expect(harness.calls.execute).toBe(1);
  });

  it("RetryOnce 的 inspect 证据身份不匹配时闭合为 OutcomeUnknown", async () => {
    const harness = createRecoveryHandlerHarness({
      inspectCheckpoint: mismatchedCheckpoint(),
    });
    const result = await harness.handler.execute(harness.command);

    expect(result.status).toBe(ResultStatus.Failure);
    expect(harness.state?.status).toBe(CodingTaskSessionCloseoutRecoveryStateStatus.OutcomeUnknown);
    expect(harness.calls).toMatchObject({ execute: 1, inspect: 1 });
  });

  it("Approved 到 Executing 的 CAS loser 不得 execute", async () => {
    const harness = createRecoveryHandlerHarness({
      storeReplaceFailure: new HarnessError(HarnessErrorCode.VersionConflict, "cas loser"),
    });
    const result = await harness.handler.execute(harness.command);

    expect(result).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.VersionConflict },
    });
    expect(harness.calls.execute).toBe(0);
  });

  it("create-only 冲突不得复用或 execute", async () => {
    const seed = createRecoveryHandlerHarness();
    const harness = createRecoveryHandlerHarness({
      existingState: approvedState(seed),
      findReturnsNull: true,
      createDisposition: CodingTaskSessionCloseoutRecoveryStateCreateDisposition.Conflict,
    });
    const result = await harness.handler.execute(harness.command);

    expect(result).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.VersionConflict },
    });
    expect(harness.calls).toMatchObject({ create: 1, replace: 0, execute: 0 });
  });

  it("create-only 同身份复用 Executing 时禁止二次 execute", async () => {
    const seed = createRecoveryHandlerHarness();
    const harness = createRecoveryHandlerHarness({
      existingState: executingState(seed),
      findReturnsNull: true,
    });
    const result = await harness.handler.execute(seed.command);

    expect(result.status).toBe(ResultStatus.Failure);
    expect(harness.state?.status).toBe(CodingTaskSessionCloseoutRecoveryStateStatus.HumanRequired);
    expect(harness.calls).toMatchObject({ create: 1, execute: 0 });
  });

  it("终态只允许原始 Human Command 重放", async () => {
    const completed = createRecoveryHandlerHarness();
    await completed.handler.execute(completed.command);
    const harness = createRecoveryHandlerHarness({
      existingState: completed.state,
      commandId: "different-recovery-command",
    });
    const result = await harness.handler.execute(harness.command);

    expect(result).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.VersionConflict },
    });
    expect(harness.calls).toMatchObject({ replace: 0, execute: 0 });
  });

  it("终态重放不依赖临时不可用的 Assessment", async () => {
    const completed = createRecoveryHandlerHarness();
    await completed.handler.execute(completed.command);
    const harness = createRecoveryHandlerHarness({
      existingState: completed.state,
      assessmentFailure: new HarnessError(HarnessErrorCode.IoFailure, "assessment unavailable"),
    });
    const result = await harness.handler.execute(harness.command);

    expect(result).toMatchObject({
      status: ResultStatus.Success,
      value: { committedVersion: 2 },
    });
    expect(harness.calls).toMatchObject({ assess: 0, replace: 0, execute: 0 });
  });

  it("Executing 重放拒绝被篡改的 expectedVersion", async () => {
    const seed = createRecoveryHandlerHarness();
    const harness = createRecoveryHandlerHarness({
      existingState: executingState(seed),
      recovery: {
        status: ChangeSetCheckpointRecoveryStatus.Present,
        checkpoint: checkpoint(),
      },
    });
    const result = await harness.handler.execute({
      ...seed.command,
      expectedVersion: seed.command.expectedVersion + 1,
    });

    expect(result).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.VersionConflict },
    });
    expect(harness.calls).toMatchObject({ replace: 0, execute: 0 });
  });

  it.each([
    {
      name: "Failure",
      options: {
        acquireFailure: new HarnessError(HarnessErrorCode.LockUnavailable, "busy"),
      },
      code: HarnessErrorCode.LockUnavailable,
    },
    {
      name: "throw",
      options: { acquireThrow: true },
      code: HarnessErrorCode.IoFailure,
    },
  ])("Repository Lock acquire $name 保持零写入和零 execute", async ({ options, code }) => {
    const harness = createRecoveryHandlerHarness(options);
    const result = await harness.handler.execute(harness.command);

    expect(result).toMatchObject({
      status: ResultStatus.Failure,
      error: { code },
    });
    expect(harness.calls).toMatchObject({ create: 0, replace: 0, execute: 0, release: 0 });
  });

  it("Repository Lock release unknown 覆盖 operation 结果且保留专属错误码", async () => {
    const harness = createRecoveryHandlerHarness({ releaseFailure: true });
    const result = await harness.handler.execute(harness.command);

    expect(result).toMatchObject({
      status: ResultStatus.Failure,
      error: {
        code: HarnessErrorCode.CodingTaskSessionCloseoutRecoveryRepositoryLockReleaseUnknown,
      },
    });
    expect(harness.calls.release).toBe(1);
  });

  it("Recovery Store create 抛出时 fail closed", async () => {
    const harness = createRecoveryHandlerHarness({ storeCreateThrow: true });
    const result = await harness.handler.execute(harness.command);

    expect(result).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.CodingTaskSessionCloseoutRecoveryCommitOutcomeUnknown },
    });
    expect(harness.calls.execute).toBe(0);
  });

  it("Recovery Store CAS 抛出时 fail closed 且不 execute", async () => {
    const harness = createRecoveryHandlerHarness({ storeReplaceThrow: true });
    const result = await harness.handler.execute(harness.command);

    expect(result).toMatchObject({
      status: ResultStatus.Failure,
      error: {
        code: HarnessErrorCode.CodingTaskSessionCloseoutRecoveryCommitOutcomeUnknown,
      },
    });
    expect(harness.calls.execute).toBe(0);
  });

  it.each([
    { name: "execute throw", options: { executeThrow: true } },
    { name: "inspect throw", options: { inspectThrow: true } },
  ])("$name 闭合为 OutcomeUnknown 且不重试 execute", async ({ options }) => {
    const harness = createRecoveryHandlerHarness(options);
    const result = await harness.handler.execute(harness.command);

    expect(result.status).toBe(ResultStatus.Failure);
    expect(harness.state?.status).toBe(CodingTaskSessionCloseoutRecoveryStateStatus.OutcomeUnknown);
    const replay = await harness.handler.execute(harness.command);
    expect(replay.status).toBe(ResultStatus.Failure);
    expect(harness.calls.execute).toBe(1);
  });
});
