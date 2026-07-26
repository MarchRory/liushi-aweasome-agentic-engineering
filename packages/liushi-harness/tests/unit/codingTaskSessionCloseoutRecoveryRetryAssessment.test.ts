import { describe, expect, it } from "vitest";

import {
  CodingTaskSessionCloseoutRecoveryDiagnostic,
  CodingTaskSessionCloseoutRecoveryDisposition,
  CodingTaskSessionCloseoutRecoveryResolution,
} from "../../src/application/codingTaskSessionCloseoutRecovery/index.js";
import { ChangeSetCheckpointRecoveryStatus } from "../../src/application/changeSetCheckpoint/index.js";
import { ResultStatus } from "../../src/common/index.js";
import {
  absentCheckpoint,
  createCodingTaskSessionCloseoutRecoveryHarness,
  presentCheckpoint,
  RecoveryStateKind,
  unknownCheckpoint,
} from "../support/codingTaskSessionCloseoutRecovery/index.js";
import { snapshot } from "../support/codingTaskSessionCloseout/index.js";

describe("CodingTask Session Closeout Retry Assessment", () => {
  it("Snapshot 未漂移且 Checkpoint Absent 时允许 RetryOnce", async () => {
    const harness = createCodingTaskSessionCloseoutRecoveryHarness(RecoveryStateKind.Retryable, {
      checkpointResult: { status: ResultStatus.Success, value: absentCheckpoint() },
    });

    const result = await harness.assess();

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status !== ResultStatus.Success) return;
    expect(result.value.disposition).toBe(
      CodingTaskSessionCloseoutRecoveryDisposition.ResolutionAvailable,
    );
    expect(result.value.allowedResolution).toBe(
      CodingTaskSessionCloseoutRecoveryResolution.RetryOnce,
    );
    expect(result.value.diagnostic).toBe(
      CodingTaskSessionCloseoutRecoveryDiagnostic.RetryAvailable,
    );
    expect(result.value.checkpointStatus).toBe(ChangeSetCheckpointRecoveryStatus.Absent);
    expect(harness.calls.snapshot).toBe(1);
    expect(harness.calls.checkpointRecovery).toBe(1);
    expectReadOnly(harness.calls);
  });

  it("Snapshot 漂移时 Fail-closed", async () => {
    const harness = createCodingTaskSessionCloseoutRecoveryHarness(RecoveryStateKind.Retryable, {
      snapshotResult: {
        status: ResultStatus.Success,
        value: { ...snapshot(), branchName: "drifted-branch" },
      },
      checkpointResult: { status: ResultStatus.Success, value: absentCheckpoint() },
    });

    const result = await harness.assess();

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status !== ResultStatus.Success) return;
    expect(result.value.disposition).toBe(
      CodingTaskSessionCloseoutRecoveryDisposition.HumanRequired,
    );
    expect(result.value.allowedResolution).toBeNull();
    expect(result.value.diagnostic).toBe(CodingTaskSessionCloseoutRecoveryDiagnostic.SnapshotDrift);
    expect(harness.calls.snapshot).toBe(1);
    expect(harness.calls.checkpointRecovery).toBe(1);
    expectReadOnly(harness.calls);
  });

  it("Checkpoint Present 会阻止 RetryOnce 且不读取 Snapshot", async () => {
    const harness = createCodingTaskSessionCloseoutRecoveryHarness(RecoveryStateKind.Retryable, {
      checkpointResult: { status: ResultStatus.Success, value: presentCheckpoint() },
    });

    const result = await harness.assess();

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status !== ResultStatus.Success) return;
    expect(result.value.disposition).toBe(
      CodingTaskSessionCloseoutRecoveryDisposition.HumanRequired,
    );
    expect(result.value.diagnostic).toBe(
      CodingTaskSessionCloseoutRecoveryDiagnostic.CheckpointUnexpected,
    );
    expect(result.value.checkpointStatus).toBe(ChangeSetCheckpointRecoveryStatus.Present);
    expect(harness.calls.snapshot).toBe(0);
    expect(harness.calls.checkpointRecovery).toBe(1);
    expectReadOnly(harness.calls);
  });

  it("Checkpoint Unknown 会阻止 RetryOnce 且不读取 Snapshot", async () => {
    const harness = createCodingTaskSessionCloseoutRecoveryHarness(RecoveryStateKind.Retryable, {
      checkpointResult: { status: ResultStatus.Success, value: unknownCheckpoint() },
    });

    const result = await harness.assess();

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status !== ResultStatus.Success) return;
    expect(result.value.disposition).toBe(
      CodingTaskSessionCloseoutRecoveryDisposition.HumanRequired,
    );
    expect(result.value.diagnostic).toBe(
      CodingTaskSessionCloseoutRecoveryDiagnostic.CheckpointUnknown,
    );
    expect(result.value.checkpointStatus).toBe(ChangeSetCheckpointRecoveryStatus.Unknown);
    expect(harness.calls.snapshot).toBe(0);
    expect(harness.calls.checkpointRecovery).toBe(1);
    expectReadOnly(harness.calls);
  });
});

function expectReadOnly(calls: {
  readonly checkpointExecute: number;
  readonly stateReplace: number;
  readonly stateCreate: number;
}): void {
  expect(calls.checkpointExecute).toBe(0);
  expect(calls.stateReplace).toBe(0);
  expect(calls.stateCreate).toBe(0);
}
