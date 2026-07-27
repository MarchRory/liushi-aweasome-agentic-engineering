import { describe, expect, it } from "vitest";

import { ChangeSetCheckpointRecoveryStatus } from "../../src/application/changeSetCheckpoint/index.js";
import {
  CodingTaskSessionCloseoutRecoveryResolution,
  CodingTaskSessionCloseoutRecoveryStateStatus,
} from "../../src/application/codingTaskSessionCloseoutRecovery/index.js";
import { HarnessErrorCode, ResultStatus } from "../../src/common/index.js";
import {
  approvedState,
  createRecoveryHandlerHarness,
  executingState,
  mismatchedCheckpoint,
} from "../support/codingTaskSessionCloseoutRecoveryHandler/index.js";
import { checkpoint, digestOf } from "../support/codingTaskSessionCloseout/index.js";

describe("CodingTaskSessionCloseoutRecoveryCommandHandler", () => {
  it("无记录时三元组漂移保持零 State 写入和零 Checkpoint", async () => {
    const harness = createRecoveryHandlerHarness({ expectedVersion: 2 });
    const result = await harness.handler.execute(harness.command);

    expect(result.status).toBe(ResultStatus.Failure);
    expect(harness.calls.create).toBe(0);
    expect(harness.calls.replace).toBe(0);
    expect(harness.calls.execute).toBe(0);
  });

  it("无记录时 Assessment Digest 漂移保持零副作用", async () => {
    const harness = createRecoveryHandlerHarness({
      expectedDigest: digestOf({ assessment: "stale" }),
    });
    const result = await harness.handler.execute(harness.command);

    expect(result).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.VersionConflict },
    });
    expect(harness.calls).toMatchObject({ create: 0, replace: 0, execute: 0 });
  });

  it("无记录时 Resolution 漂移保持零副作用", async () => {
    const harness = createRecoveryHandlerHarness({
      allowedResolution: CodingTaskSessionCloseoutRecoveryResolution.BindExisting,
    });
    const result = await harness.handler.execute(harness.command);

    expect(result).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.VersionConflict },
    });
    expect(harness.calls).toMatchObject({ create: 0, replace: 0, execute: 0 });
  });

  it("已有 Approved 的 Assessment 漂移闭合为 HumanRequired", async () => {
    const seed = createRecoveryHandlerHarness();
    const harness = createRecoveryHandlerHarness({
      existingState: approvedState(seed),
      freshAssessmentDigest: digestOf({ assessment: "changed" }),
    });
    const result = await harness.handler.execute(seed.command);

    expect(result.status).toBe(ResultStatus.Failure);
    expect(harness.state?.status).toBe(CodingTaskSessionCloseoutRecoveryStateStatus.HumanRequired);
    expect(harness.calls).toMatchObject({ replace: 1, execute: 0 });
  });

  it("BindExisting 只绑定 fresh Present Checkpoint，永不 execute", async () => {
    const harness = createRecoveryHandlerHarness({
      resolution: CodingTaskSessionCloseoutRecoveryResolution.BindExisting,
      recovery: { status: ChangeSetCheckpointRecoveryStatus.Present, checkpoint: checkpoint() },
    });
    const result = await harness.handler.execute(harness.command);

    expect(result).toMatchObject({ status: ResultStatus.Success, value: { committedVersion: 1 } });
    expect(harness.calls.execute).toBe(0);
    expect(harness.state?.status).toBe(
      CodingTaskSessionCloseoutRecoveryStateStatus.CheckpointBound,
    );
    const replay = await harness.handler.execute(harness.command);
    expect(replay).toMatchObject({ status: ResultStatus.Success, value: { committedVersion: 1 } });
    expect(harness.calls.replace).toBe(1);
  });

  it("RetryOnce 的 CAS winner 仅 execute 一次并在 inspect 后绑定", async () => {
    const harness = createRecoveryHandlerHarness();
    const result = await harness.handler.execute(harness.command);

    expect(result).toMatchObject({ status: ResultStatus.Success, value: { committedVersion: 2 } });
    expect(harness.calls.execute).toBe(1);
    expect(harness.calls.inspect).toBe(1);
  });

  it("Executing 重放在 Present 时只读绑定且 execute 为零", async () => {
    const seed = createRecoveryHandlerHarness();
    const harness = createRecoveryHandlerHarness({
      existingState: executingState(seed),
      recovery: { status: ChangeSetCheckpointRecoveryStatus.Present, checkpoint: checkpoint() },
    });
    const result = await harness.handler.execute(seed.command);

    expect(result).toMatchObject({ status: ResultStatus.Success, value: { committedVersion: 2 } });
    expect(harness.calls.execute).toBe(0);
  });

  it("Executing 重放不比较旧 Assessment Digest", async () => {
    const seed = createRecoveryHandlerHarness();
    const harness = createRecoveryHandlerHarness({
      existingState: executingState(seed),
      freshAssessmentDigest: digestOf({ assessment: "changed-by-checkpoint" }),
      recovery: {
        status: ChangeSetCheckpointRecoveryStatus.Present,
        checkpoint: checkpoint(),
      },
    });
    const result = await harness.handler.execute(seed.command);
    expect(result).toMatchObject({
      status: ResultStatus.Success,
      value: { committedVersion: 2 },
    });
    expect(harness.calls.execute).toBe(0);
  });

  it("Executing 重放拒绝绑定 Snapshot 或 ChangeSet 不匹配的 Checkpoint", async () => {
    const seed = createRecoveryHandlerHarness();
    const harness = createRecoveryHandlerHarness({
      existingState: executingState(seed),
      recovery: {
        status: ChangeSetCheckpointRecoveryStatus.Present,
        checkpoint: mismatchedCheckpoint(),
      },
    });
    const result = await harness.handler.execute(seed.command);

    expect(result.status).toBe(ResultStatus.Failure);
    expect(harness.state?.status).toBe(CodingTaskSessionCloseoutRecoveryStateStatus.HumanRequired);
    expect(harness.calls.execute).toBe(0);
  });

  it.each([ChangeSetCheckpointRecoveryStatus.Absent, ChangeSetCheckpointRecoveryStatus.Unknown])(
    "Executing 的 %s 复放转为 HumanRequired 且不二次 execute",
    async (status) => {
      const seed = createRecoveryHandlerHarness();
      const recovery =
        status === ChangeSetCheckpointRecoveryStatus.Absent
          ? { status: ChangeSetCheckpointRecoveryStatus.Absent as const }
          : { status: ChangeSetCheckpointRecoveryStatus.Unknown as const };
      const harness = createRecoveryHandlerHarness({
        existingState: executingState(seed),
        recovery,
      });
      const result = await harness.handler.execute(seed.command);

      expect(result.status).toBe(ResultStatus.Failure);
      expect(harness.state?.status).toBe(
        CodingTaskSessionCloseoutRecoveryStateStatus.HumanRequired,
      );
      expect(harness.calls.execute).toBe(0);
      const replay = await harness.handler.execute(seed.command);
      expect(replay.status).toBe(ResultStatus.Failure);
      expect(harness.calls.replace).toBe(1);
    },
  );
});
