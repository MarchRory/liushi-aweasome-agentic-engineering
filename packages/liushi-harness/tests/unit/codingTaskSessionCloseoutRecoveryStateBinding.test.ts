import { describe, expect, it } from "vitest";

import {
  bindExistingCodingTaskSessionCloseoutRecoveryCheckpoint,
  bindRetriedCodingTaskSessionCloseoutRecoveryCheckpoint,
  CodingTaskSessionCloseoutRecoveryResolution,
  createCodingTaskSessionCloseoutRecoveryState,
  markCodingTaskSessionCloseoutRecoveryExecuting,
  markCodingTaskSessionCloseoutRecoveryOutcomeUnknown,
  markCodingTaskSessionCloseoutRecoveryRetryNotApplied,
  rebuildCodingTaskSessionCloseoutRecoveryState,
} from "../../src/application/codingTaskSessionCloseoutRecovery/index.js";
import {
  HarnessErrorCode,
  ResultStatus,
  type HarnessError,
  type Result,
} from "../../src/common/index.js";
import {
  approvedRecoveryState,
  checkpointInput,
  recoveryStateInput,
  unwrap,
} from "../support/codingTaskSessionCloseoutRecovery/codingTaskSessionCloseoutRecoveryStateFixture.js";
import { digest, digestOf } from "../support/codingTaskSessionCloseout/index.js";

describe("CodingTask Session Closeout Recovery State Binding", () => {
  it("要求 Assessment Checkpoint Binding 与 Resolution 精确组合", () => {
    const bindWithoutCheckpoint = createCodingTaskSessionCloseoutRecoveryState(
      recoveryStateInput(CodingTaskSessionCloseoutRecoveryResolution.BindExisting, {
        assessmentCheckpointBindingDigest: null,
      }),
    );
    const retryWithCheckpoint = createCodingTaskSessionCloseoutRecoveryState(
      recoveryStateInput(CodingTaskSessionCloseoutRecoveryResolution.RetryOnce, {
        assessmentCheckpointBindingDigest: digestOf({ checkpoint: "unexpected" }),
      }),
    );

    expectFailure(bindWithoutCheckpoint, HarnessErrorCode.InvalidInput);
    expectFailure(retryWithCheckpoint, HarnessErrorCode.InvalidInput);
  });

  it("拒绝与 Snapshot、ChangeSet 或 Assessment 不一致的 Checkpoint", () => {
    const changedSet = approvedRecoveryState(
      CodingTaskSessionCloseoutRecoveryResolution.BindExisting,
      { changeSetDigest: digestOf({ changeSet: "other" }) },
    );
    const changedAssessment = approvedRecoveryState(
      CodingTaskSessionCloseoutRecoveryResolution.BindExisting,
      { assessmentCheckpointBindingDigest: digestOf({ checkpoint: "other" }) },
    );
    const changedSnapshot = approvedRecoveryState(
      CodingTaskSessionCloseoutRecoveryResolution.RetryOnce,
      { preSubmitSnapshotDigest: digestOf({ snapshot: "other" }) },
    );
    const executing = unwrap(
      markCodingTaskSessionCloseoutRecoveryExecuting(
        changedSnapshot,
        { updatedAt: "2026-07-27T00:00:01.000Z" },
        digest,
      ),
    );

    expectFailure(
      bindExistingCodingTaskSessionCloseoutRecoveryCheckpoint(
        changedSet,
        checkpointInput(),
        digest,
      ),
      HarnessErrorCode.InvalidInput,
    );
    expectFailure(
      bindExistingCodingTaskSessionCloseoutRecoveryCheckpoint(
        changedAssessment,
        checkpointInput(),
        digest,
      ),
      HarnessErrorCode.InvalidInput,
    );
    expectFailure(
      bindRetriedCodingTaskSessionCloseoutRecoveryCheckpoint(
        executing,
        checkpointInput("2026-07-27T00:00:02.000Z"),
        digest,
      ),
      HarnessErrorCode.InvalidInput,
    );
  });

  it("持久化重建继续复验 Checkpoint 与 Recovery 身份的绑定", () => {
    const approved = approvedRecoveryState(
      CodingTaskSessionCloseoutRecoveryResolution.BindExisting,
    );
    const bound = unwrap(
      bindExistingCodingTaskSessionCloseoutRecoveryCheckpoint(approved, checkpointInput(), digest),
    );

    expectFailure(
      rebuildCodingTaskSessionCloseoutRecoveryState(
        { ...bound, changeSetDigest: digestOf({ changeSet: "tampered" }) },
        digest,
      ),
      HarnessErrorCode.InvalidInput,
    );
  });

  it("RetryNotApplied 与 OutcomeUnknown 只接受各自稳定错误码", () => {
    const approved = approvedRecoveryState(CodingTaskSessionCloseoutRecoveryResolution.RetryOnce);
    const executing = unwrap(
      markCodingTaskSessionCloseoutRecoveryExecuting(
        approved,
        { updatedAt: "2026-07-27T00:00:01.000Z" },
        digest,
      ),
    );
    const terminalBase = {
      recoveryGuidance: "等待 Human 复核。",
      updatedAt: "2026-07-27T00:00:02.000Z",
    };

    expectFailure(
      markCodingTaskSessionCloseoutRecoveryRetryNotApplied(
        executing,
        {
          ...terminalBase,
          errorCode: HarnessErrorCode.CodingTaskSessionCloseoutCheckpointOutcomeUnknown,
        },
        digest,
      ),
      HarnessErrorCode.InvalidInput,
    );
    expectFailure(
      markCodingTaskSessionCloseoutRecoveryOutcomeUnknown(
        executing,
        {
          ...terminalBase,
          errorCode: HarnessErrorCode.CodingTaskSessionCloseoutCheckpointNotApplied,
        },
        digest,
      ),
      HarnessErrorCode.InvalidInput,
    );
  });
});

function expectFailure<T>(result: Result<T, HarnessError>, code: HarnessErrorCode): void {
  expect(result.status).toBe(ResultStatus.Failure);
  if (result.status === ResultStatus.Failure) expect(result.error.code).toBe(code);
}
