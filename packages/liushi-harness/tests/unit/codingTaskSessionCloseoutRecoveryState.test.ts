import { describe, expect, it } from "vitest";

import {
  bindExistingCodingTaskSessionCloseoutRecoveryCheckpoint,
  bindRetriedCodingTaskSessionCloseoutRecoveryCheckpoint,
  CodingTaskSessionCloseoutRecoveryResolution,
  CodingTaskSessionCloseoutRecoveryStateStatus,
  markCodingTaskSessionCloseoutRecoveryExecuting,
  markCodingTaskSessionCloseoutRecoveryOutcomeUnknown,
  markCodingTaskSessionCloseoutRecoveryRetryNotApplied,
  rebuildCodingTaskSessionCloseoutRecoveryState,
  requireHumanForCodingTaskSessionCloseoutRecovery,
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
  terminalInput,
  unwrap,
} from "../support/codingTaskSessionCloseoutRecovery/codingTaskSessionCloseoutRecoveryStateFixture.js";
import { checkpoint, digest } from "../support/codingTaskSessionCloseout/index.js";

describe("CodingTask Session Closeout Recovery Process State", () => {
  it("只暴露六个固定状态，并创建 Approved version=0", () => {
    expect(Object.values(CodingTaskSessionCloseoutRecoveryStateStatus)).toEqual([
      "approved",
      "executing",
      "checkpoint_bound",
      "retry_not_applied",
      "outcome_unknown",
      "human_required",
    ]);

    const state = approvedRecoveryState(CodingTaskSessionCloseoutRecoveryResolution.RetryOnce);
    expect(state).toMatchObject({
      status: CodingTaskSessionCloseoutRecoveryStateStatus.Approved,
      version: 0,
      checkpoint: null,
    });
    expect(state.requestDigest).toMatch(/^sha256:/u);
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.actor)).toBe(true);
  });

  it("BindExisting 不经过 Executing 直接绑定完整 Checkpoint", () => {
    const approved = approvedRecoveryState(
      CodingTaskSessionCloseoutRecoveryResolution.BindExisting,
    );
    const bound = unwrap(
      bindExistingCodingTaskSessionCloseoutRecoveryCheckpoint(approved, checkpointInput(), digest),
    );

    expect(bound.status).toBe(CodingTaskSessionCloseoutRecoveryStateStatus.CheckpointBound);
    expect(bound.version).toBe(1);
    expect(bound.checkpoint).not.toBeNull();
    expect(bound.requestedResolution).toBe(
      CodingTaskSessionCloseoutRecoveryResolution.BindExisting,
    );
  });

  it("RetryOnce 必须先持久化 Executing，再绑定 Checkpoint 或闭合结果", () => {
    const approved = approvedRecoveryState(CodingTaskSessionCloseoutRecoveryResolution.RetryOnce);
    const executing = unwrap(
      markCodingTaskSessionCloseoutRecoveryExecuting(
        approved,
        { updatedAt: "2026-07-27T00:00:01.000Z" },
        digest,
      ),
    );
    const bound = unwrap(
      bindRetriedCodingTaskSessionCloseoutRecoveryCheckpoint(
        executing,
        checkpointInput("2026-07-27T00:00:02.000Z"),
        digest,
      ),
    );
    const notApplied = unwrap(
      markCodingTaskSessionCloseoutRecoveryRetryNotApplied(
        executing,
        {
          errorCode: HarnessErrorCode.CodingTaskSessionCloseoutCheckpointNotApplied,
          recoveryGuidance: "确认 Checkpoint 未应用。",
          updatedAt: "2026-07-27T00:00:02.000Z",
        },
        digest,
      ),
    );
    const unknown = unwrap(
      markCodingTaskSessionCloseoutRecoveryOutcomeUnknown(
        executing,
        terminalInput("2026-07-27T00:00:02.000Z"),
        digest,
      ),
    );

    expect(executing.status).toBe(CodingTaskSessionCloseoutRecoveryStateStatus.Executing);
    expect(executing.version).toBe(1);
    expect(bound.version).toBe(2);
    expect(notApplied.status).toBe(CodingTaskSessionCloseoutRecoveryStateStatus.RetryNotApplied);
    expect(unknown.status).toBe(CodingTaskSessionCloseoutRecoveryStateStatus.OutcomeUnknown);
    expect(notApplied.version).toBe(2);
    expect(unknown.version).toBe(2);
  });

  it("Approved 可以转入 HumanRequired，但不能绕过 RetryOnce 直接绑定", () => {
    const retryApproved = approvedRecoveryState(
      CodingTaskSessionCloseoutRecoveryResolution.RetryOnce,
    );
    const humanRequired = unwrap(
      requireHumanForCodingTaskSessionCloseoutRecovery(
        retryApproved,
        terminalInput("2026-07-27T00:00:01.000Z"),
        digest,
      ),
    );
    const directBind = bindExistingCodingTaskSessionCloseoutRecoveryCheckpoint(
      retryApproved,
      checkpointInput(),
      digest,
    );

    expect(humanRequired.status).toBe(CodingTaskSessionCloseoutRecoveryStateStatus.HumanRequired);
    expect(humanRequired.version).toBe(1);
    expectFailure(directBind, HarnessErrorCode.InvalidStateTransition);
  });

  it("严格拒绝非法身份、额外字段、摘要和 Checkpoint", () => {
    const approved = approvedRecoveryState(CodingTaskSessionCloseoutRecoveryResolution.RetryOnce);
    const extra = rebuildCodingTaskSessionCloseoutRecoveryState(
      { ...approved, unexpected: true },
      digest,
    );
    const invalidRequestDigest = rebuildCodingTaskSessionCloseoutRecoveryState(
      { ...approved, requestDigest: "not-a-digest" },
      digest,
    );
    const invalidActor = rebuildCodingTaskSessionCloseoutRecoveryState(
      { ...approved, actor: { kind: "agent", actorId: "agent" } },
      digest,
    );
    const invalidCheckpoint = bindExistingCodingTaskSessionCloseoutRecoveryCheckpoint(
      approvedRecoveryState(CodingTaskSessionCloseoutRecoveryResolution.BindExisting),
      {
        ...checkpointInput(),
        checkpoint: {
          ...checkpoint(),
          bindingDigest: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
        },
      },
      digest,
    );

    expectFailure(extra, HarnessErrorCode.InvalidInput);
    expectFailure(invalidRequestDigest, HarnessErrorCode.InvalidInput);
    expectFailure(invalidActor, HarnessErrorCode.InvalidInput);
    expectFailure(invalidCheckpoint, HarnessErrorCode.InvalidInput);
  });

  it("拒绝非法 Resolution、时间倒退和终态继续推进", () => {
    const bindApproved = approvedRecoveryState(
      CodingTaskSessionCloseoutRecoveryResolution.BindExisting,
    );
    const retryFromBind = markCodingTaskSessionCloseoutRecoveryExecuting(
      bindApproved,
      { updatedAt: "2026-07-27T00:00:01.000Z" },
      digest,
    );
    const retryApproved = approvedRecoveryState(
      CodingTaskSessionCloseoutRecoveryResolution.RetryOnce,
    );
    const executing = unwrap(
      markCodingTaskSessionCloseoutRecoveryExecuting(
        retryApproved,
        { updatedAt: "2026-07-27T00:00:01.000Z" },
        digest,
      ),
    );
    const oldTime = markCodingTaskSessionCloseoutRecoveryOutcomeUnknown(
      executing,
      terminalInput("2026-07-27T00:00:00.000Z"),
      digest,
    );
    const terminal = unwrap(
      markCodingTaskSessionCloseoutRecoveryOutcomeUnknown(
        executing,
        terminalInput("2026-07-27T00:00:02.000Z"),
        digest,
      ),
    );
    const successor = requireHumanForCodingTaskSessionCloseoutRecovery(
      terminal,
      terminalInput("2026-07-27T00:00:03.000Z"),
      digest,
    );

    expectFailure(retryFromBind, HarnessErrorCode.InvalidStateTransition);
    expectFailure(oldTime, HarnessErrorCode.InvalidStateTransition);
    expectFailure(successor, HarnessErrorCode.InvalidStateTransition);
  });

  it("持久化重建精确约束每个状态的唯一版本组合", () => {
    const approved = approvedRecoveryState(CodingTaskSessionCloseoutRecoveryResolution.RetryOnce);
    const executing = unwrap(
      markCodingTaskSessionCloseoutRecoveryExecuting(
        approved,
        { updatedAt: "2026-07-27T00:00:01.000Z" },
        digest,
      ),
    );
    const retryBound = unwrap(
      bindRetriedCodingTaskSessionCloseoutRecoveryCheckpoint(
        executing,
        checkpointInput("2026-07-27T00:00:02.000Z"),
        digest,
      ),
    );
    const bindApproved = approvedRecoveryState(
      CodingTaskSessionCloseoutRecoveryResolution.BindExisting,
    );
    const existingBound = unwrap(
      bindExistingCodingTaskSessionCloseoutRecoveryCheckpoint(
        bindApproved,
        checkpointInput("2026-07-27T00:00:01.000Z"),
        digest,
      ),
    );

    expectFailure(
      rebuildCodingTaskSessionCloseoutRecoveryState(
        { ...approved, updatedAt: "2026-07-27T00:00:01.000Z" },
        digest,
      ),
      HarnessErrorCode.InvalidInput,
    );
    expectFailure(
      rebuildCodingTaskSessionCloseoutRecoveryState({ ...executing, version: 99 }, digest),
      HarnessErrorCode.InvalidInput,
    );
    expectFailure(
      rebuildCodingTaskSessionCloseoutRecoveryState({ ...existingBound, version: 2 }, digest),
      HarnessErrorCode.InvalidInput,
    );
    expectFailure(
      rebuildCodingTaskSessionCloseoutRecoveryState({ ...retryBound, version: 1 }, digest),
      HarnessErrorCode.InvalidInput,
    );
  });
});

function expectFailure<T>(result: Result<T, HarnessError>, code: HarnessErrorCode): void {
  expect(result.status).toBe(ResultStatus.Failure);
  if (result.status === ResultStatus.Failure) expect(result.error.code).toBe(code);
}
