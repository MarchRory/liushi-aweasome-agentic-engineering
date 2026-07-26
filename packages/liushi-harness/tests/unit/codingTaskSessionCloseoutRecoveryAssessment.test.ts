import { describe, expect, it } from "vitest";

import {
  CodingTaskSessionCloseoutRecoveryDiagnostic,
  CodingTaskSessionCloseoutRecoveryDisposition,
  CodingTaskSessionCloseoutRecoveryResolution,
} from "../../src/application/codingTaskSessionCloseoutRecovery/index.js";
import { ChangeSetCheckpointRecoveryStatus } from "../../src/application/changeSetCheckpoint/index.js";
import { HarnessErrorCode, ResultStatus, success } from "../../src/common/index.js";
import {
  absentCheckpoint,
  checkpointFailure,
  createCodingTaskSessionCloseoutRecoveryHarness,
  presentCheckpoint,
  RecoveryStateKind,
  snapshotFailure,
  unknownCheckpoint,
  resultValue,
} from "../support/codingTaskSessionCloseoutRecovery/index.js";
import { digest } from "../support/codingTaskSessionCloseout/index.js";

describe("CodingTask Session Closeout Recovery Assessment", () => {
  it("OutcomeUnknown@SnapshotPersisted + Present 允许 BindExisting", async () => {
    const harness = createCodingTaskSessionCloseoutRecoveryHarness(
      RecoveryStateKind.SnapshotPersistedUnknown,
      { checkpointResult: { status: ResultStatus.Success, value: presentCheckpoint() } },
    );

    const result = await harness.assess();

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status !== ResultStatus.Success) return;
    expect(result.value.allowedResolution).toBe(
      CodingTaskSessionCloseoutRecoveryResolution.BindExisting,
    );
    expect(result.value.diagnostic).toBe(
      CodingTaskSessionCloseoutRecoveryDiagnostic.BindExistingAvailable,
    );
    expect(harness.calls.snapshot).toBe(0);
    expect(harness.calls.checkpointRecovery).toBe(1);
    expectReadOnly(harness.calls);
  });

  it.each([
    ["Absent", { status: ResultStatus.Success, value: absentCheckpoint() }],
    ["Unknown", { status: ResultStatus.Success, value: unknownCheckpoint() }],
    ["failure", checkpointFailure()],
  ] as const)("OutcomeUnknown@SnapshotPersisted + %s 必须 HumanRequired", async (_name, result) => {
    const harness = createCodingTaskSessionCloseoutRecoveryHarness(
      RecoveryStateKind.SnapshotPersistedUnknown,
      { checkpointResult: result },
    );

    const assessed = await harness.assess();

    expect(assessed.status).toBe(ResultStatus.Success);
    if (assessed.status !== ResultStatus.Success) return;
    expect(assessed.value.disposition).toBe(
      CodingTaskSessionCloseoutRecoveryDisposition.HumanRequired,
    );
    expect(assessed.value.allowedResolution).toBeNull();
    expectReadOnly(harness.calls);
  });

  it("OutcomeUnknown@CheckpointBound 保留的 Checkpoint 精确匹配时允许 BindExisting", async () => {
    const harness = createCodingTaskSessionCloseoutRecoveryHarness(
      RecoveryStateKind.CheckpointBoundUnknown,
      { checkpointResult: { status: ResultStatus.Success, value: presentCheckpoint() } },
    );

    const result = await harness.assess();

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status !== ResultStatus.Success) return;
    expect(result.value.allowedResolution).toBe(
      CodingTaskSessionCloseoutRecoveryResolution.BindExisting,
    );
    expect(result.value.diagnostic).toBe(
      CodingTaskSessionCloseoutRecoveryDiagnostic.BindExistingAvailable,
    );
  });

  it("OutcomeUnknown@CheckpointBound Checkpoint 不匹配时必须 HumanRequired", async () => {
    const mismatch = presentCheckpoint();
    if (mismatch.status !== ChangeSetCheckpointRecoveryStatus.Present) return;
    const targetRevision = "c".repeat(40);
    const checkpointDigest = resultValue(
      digest.calculate({
        targetRevision,
        changedPaths: mismatch.checkpoint.checkpoint.changedPaths,
      }),
    );
    const bindingDigest = resultValue(
      digest.calculate({
        schemaVersion: mismatch.checkpoint.schemaVersion,
        checkpointDigest,
        changeSetDigest: mismatch.checkpoint.changeSetDigest,
        preSubmitSnapshotDigest: mismatch.checkpoint.preSubmitSnapshotDigest,
      }),
    );
    const harness = createCodingTaskSessionCloseoutRecoveryHarness(
      RecoveryStateKind.CheckpointBoundUnknown,
      {
        checkpointResult: {
          status: ResultStatus.Success,
          value: {
            status: ChangeSetCheckpointRecoveryStatus.Present,
            checkpoint: {
              ...mismatch.checkpoint,
              bindingDigest,
              checkpoint: {
                ...mismatch.checkpoint.checkpoint,
                targetRevision,
                checkpointDigest,
              },
            },
          },
        },
      },
    );

    const result = await harness.assess();

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status !== ResultStatus.Success) return;
    expect(result.value.disposition).toBe(
      CodingTaskSessionCloseoutRecoveryDisposition.HumanRequired,
    );
    expect(result.value.diagnostic).toBe(
      CodingTaskSessionCloseoutRecoveryDiagnostic.CheckpointMismatch,
    );
  });

  it("OutcomeUnknown@Closing 不调用 Snapshot 或 Checkpoint Recovery", async () => {
    const harness = createCodingTaskSessionCloseoutRecoveryHarness(
      RecoveryStateKind.ClosingUnknown,
      {
        checkpointResult: { status: ResultStatus.Success, value: presentCheckpoint() },
      },
    );

    const result = await harness.assess();

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status !== ResultStatus.Success) return;
    expect(result.value.disposition).toBe(
      CodingTaskSessionCloseoutRecoveryDisposition.HumanRequired,
    );
    expect(result.value.diagnostic).toBe(
      CodingTaskSessionCloseoutRecoveryDiagnostic.CloseoutStageNotAllowed,
    );
    expect(harness.calls.snapshot).toBe(0);
    expect(harness.calls.checkpointRecovery).toBe(0);
    expectReadOnly(harness.calls);
  });

  it.each([
    ["checkpoint failure", { checkpointResult: checkpointFailure() }],
    ["checkpoint throw", { checkpointThrow: true }],
    [
      "snapshot failure",
      {
        checkpointResult: success(absentCheckpoint()),
        snapshotResult: snapshotFailure(),
      },
    ],
    [
      "snapshot throw",
      {
        checkpointResult: success(absentCheckpoint()),
        snapshotThrow: true,
      },
    ],
  ])("Assessment port %s 时 Fail-closed", async (_name, options) => {
    const harness = createCodingTaskSessionCloseoutRecoveryHarness(
      RecoveryStateKind.Retryable,
      options,
    );

    const result = await harness.assess();

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status !== ResultStatus.Success) return;
    expect(result.value.disposition).toBe(
      CodingTaskSessionCloseoutRecoveryDisposition.HumanRequired,
    );
    expect(result.value.allowedResolution).toBeNull();
    expect(harness.calls.snapshot).toBe(
      "snapshotResult" in options || "snapshotThrow" in options ? 1 : 0,
    );
    expect(harness.calls.checkpointRecovery).toBe(1);
    expectReadOnly(harness.calls);
  });

  it("公开输入包含额外字段时严格拒绝且不进入现场 Assessment", async () => {
    const harness = createCodingTaskSessionCloseoutRecoveryHarness(
      RecoveryStateKind.ClosingUnknown,
    );

    const result = await harness.useCase.execute({
      workspaceId: harness.authority.activation.workspaceId,
      sessionId: harness.authority.activation.sessionId,
      unexpected: true,
    });

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status !== ResultStatus.Failure) return;
    expect(result.error.code).toBe(HarnessErrorCode.InvalidInput);
    expect(harness.calls.snapshot).toBe(0);
    expect(harness.calls.checkpointRecovery).toBe(0);
    expectReadOnly(harness.calls);
  });

  it("State 身份漂移失败，且不进入现场 Assessment", async () => {
    const harness = createCodingTaskSessionCloseoutRecoveryHarness(
      RecoveryStateKind.ClosingUnknown,
      {
        stateOverride: (state) => ({ ...state, codingTaskId: "drifted-coding-task" as never }),
      },
    );

    const result = await harness.assess();

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status !== ResultStatus.Failure) return;
    expect(result.error.code).toBe(HarnessErrorCode.VersionConflict);
    expectReadOnly(harness.calls);
  });

  it("State 中被篡改的 requestDigest 不能绕过现有 Closeout Command Parser", async () => {
    const harness = createCodingTaskSessionCloseoutRecoveryHarness(
      RecoveryStateKind.ClosingUnknown,
      {
        stateOverride: (state) => ({
          ...state,
          requestDigest: resultValue(digest.calculate({ request: "not-canonical" })),
        }),
      },
    );

    const result = await harness.assess();

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status !== ResultStatus.Failure) return;
    expect(result.error.code).toBe(HarnessErrorCode.InvalidInput);
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
