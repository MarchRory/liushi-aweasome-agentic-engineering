import { describe, expect, it } from "vitest";

import {
  bindExistingCodingTaskSessionCloseoutRecoveryCheckpoint,
  bindRetriedCodingTaskSessionCloseoutRecoveryCheckpoint,
  CodingTaskSessionCloseoutRecoveryResolution,
  CodingTaskSessionCloseoutRecoveryStateStatus,
  markCodingTaskSessionCloseoutRecoveryExecuting,
  markCodingTaskSessionCloseoutRecoveryOutcomeUnknown,
  markCodingTaskSessionCloseoutRecoveryRetryNotApplied,
  requireHumanForCodingTaskSessionCloseoutRecovery,
  validateCodingTaskSessionCloseoutRecoveryStateSuccessor,
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
import { checkpoint, digest, digestOf } from "../support/codingTaskSessionCloseout/index.js";

describe("CodingTask Session Closeout Recovery State Successor", () => {
  it("只允许固定状态机边，并要求 CAS version 递增一版", () => {
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
          recoveryGuidance: "确认未应用。",
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
    const human = unwrap(
      requireHumanForCodingTaskSessionCloseoutRecovery(
        executing,
        terminalInput("2026-07-27T00:00:02.000Z"),
        digest,
      ),
    );

    expectSuccess(
      validateCodingTaskSessionCloseoutRecoveryStateSuccessor(retryApproved, executing, digest),
    );
    expectSuccess(
      validateCodingTaskSessionCloseoutRecoveryStateSuccessor(executing, bound, digest),
    );
    expectSuccess(
      validateCodingTaskSessionCloseoutRecoveryStateSuccessor(executing, notApplied, digest),
    );
    expectSuccess(
      validateCodingTaskSessionCloseoutRecoveryStateSuccessor(executing, unknown, digest),
    );
    expectSuccess(
      validateCodingTaskSessionCloseoutRecoveryStateSuccessor(executing, human, digest),
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
    const approvedHuman = unwrap(
      requireHumanForCodingTaskSessionCloseoutRecovery(
        bindApproved,
        terminalInput("2026-07-27T00:00:01.000Z"),
        digest,
      ),
    );
    expectSuccess(
      validateCodingTaskSessionCloseoutRecoveryStateSuccessor(bindApproved, existingBound, digest),
    );
    expectSuccess(
      validateCodingTaskSessionCloseoutRecoveryStateSuccessor(bindApproved, approvedHuman, digest),
    );
  });

  it("拒绝同幂等键下的 requestDigest 漂移和独立 candidate 越过合法前驱", () => {
    const approved = approvedRecoveryState(CodingTaskSessionCloseoutRecoveryResolution.RetryOnce);
    const executing = unwrap(
      markCodingTaskSessionCloseoutRecoveryExecuting(
        approved,
        { updatedAt: "2026-07-27T00:00:01.000Z" },
        digest,
      ),
    );
    const digestDrift = { ...executing, requestDigest: digestOf({ command: "different" }) };
    const bindCandidate = {
      ...executing,
      status: CodingTaskSessionCloseoutRecoveryStateStatus.CheckpointBound,
      checkpoint: checkpoint(),
      version: 2,
    };

    expectFailure(
      validateCodingTaskSessionCloseoutRecoveryStateSuccessor(approved, digestDrift, digest),
      HarnessErrorCode.PreconditionNotMet,
    );
    expectFailure(
      validateCodingTaskSessionCloseoutRecoveryStateSuccessor(approved, bindCandidate, digest),
      HarnessErrorCode.InvalidStateTransition,
    );
  });

  it("拒绝版本错误、时间倒退和已闭合状态的继续迁移", () => {
    const approved = approvedRecoveryState(CodingTaskSessionCloseoutRecoveryResolution.RetryOnce);
    const executing = unwrap(
      markCodingTaskSessionCloseoutRecoveryExecuting(
        approved,
        { updatedAt: "2026-07-27T00:00:01.000Z" },
        digest,
      ),
    );
    const terminal = unwrap(
      markCodingTaskSessionCloseoutRecoveryOutcomeUnknown(
        executing,
        terminalInput("2026-07-27T00:00:02.000Z"),
        digest,
      ),
    );
    const wrongVersion = {
      ...terminal,
      status: CodingTaskSessionCloseoutRecoveryStateStatus.HumanRequired,
      version: 2,
    };
    const oldTime = { ...terminal, version: 2, updatedAt: "2026-07-27T00:00:00.500Z" };
    const afterTerminal = {
      ...terminal,
      status: CodingTaskSessionCloseoutRecoveryStateStatus.HumanRequired,
      version: 2,
      updatedAt: "2026-07-27T00:00:03.000Z",
    };

    expectFailure(
      validateCodingTaskSessionCloseoutRecoveryStateSuccessor(approved, wrongVersion, digest),
      HarnessErrorCode.InvalidStateTransition,
    );
    expectFailure(
      validateCodingTaskSessionCloseoutRecoveryStateSuccessor(executing, oldTime, digest),
      HarnessErrorCode.InvalidStateTransition,
    );
    expectFailure(
      validateCodingTaskSessionCloseoutRecoveryStateSuccessor(terminal, afterTerminal, digest),
      HarnessErrorCode.InvalidStateTransition,
    );
  });
});

function expectSuccess<T>(result: Result<T, HarnessError>): void {
  expect(result.status).toBe(ResultStatus.Success);
}

function expectFailure<T>(result: Result<T, HarnessError>, code: HarnessErrorCode): void {
  expect(result.status).toBe(ResultStatus.Failure);
  if (result.status === ResultStatus.Failure) expect(result.error.code).toBe(code);
}
