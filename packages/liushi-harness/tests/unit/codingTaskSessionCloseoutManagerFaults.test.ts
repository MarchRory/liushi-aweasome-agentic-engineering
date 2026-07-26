import { describe, expect, it } from "vitest";

import { CodingTaskSessionCloseoutStatus } from "../../src/application/codingTaskSessionCloseoutState/index.js";
import { HarnessError, HarnessErrorCode, ResultStatus } from "../../src/common/index.js";
import { ActionOutcome } from "../../src/domain/actionJournal/index.js";
import {
  createCloseoutManagerCommand,
  createCloseoutManagerHarness,
  type CloseoutManagerHarnessCalls,
  type CloseoutManagerHarnessOptions,
} from "../support/codingTaskSessionCloseoutManager/index.js";

describe("CodingTaskSessionCloseoutManager 组合故障", () => {
  it.each([
    {
      name: "Admission 首次普通 IoFailure 后保持 Closing，重试成功",
      options: {
        admissionFailures: [new HarnessError(HarnessErrorCode.IoFailure, "admission")],
      },
      first: {
        resultStatus: ResultStatus.Failure,
        errorCode: HarnessErrorCode.IoFailure,
      },
      second: {
        resultStatus: ResultStatus.Success,
        valueStatus: CodingTaskSessionCloseoutStatus.CheckpointBound,
      },
      calls: { admission: 2 },
    },
    {
      name: "Checkpoint NotApplied 的 Blocked replace 失败仍返回 NotApplied",
      options: {
        checkpointOutcome: ActionOutcome.NotApplied,
        replaceFailures: {
          1: [new HarnessError(HarnessErrorCode.VersionConflict, "blocked")],
        },
      },
      first: {
        resultStatus: ResultStatus.Failure,
        errorCode: HarnessErrorCode.CodingTaskSessionCloseoutCheckpointNotApplied,
      },
      stateStatus: CodingTaskSessionCloseoutStatus.SnapshotPersisted,
    },
    {
      name: "Lock release 与 OutcomeUnknown replace 同时失败仍返回 LockReleaseUnknown",
      options: {
        checkpointFailures: [new HarnessError(HarnessErrorCode.LockUnavailable, "checkpoint")],
        releaseFailure: true,
        replaceFailures: {
          1: [new HarnessError(HarnessErrorCode.IoFailure, "unknown")],
        },
      },
      first: {
        resultStatus: ResultStatus.Failure,
        errorCode: HarnessErrorCode.CodingTaskSessionCloseoutLockReleaseUnknown,
      },
      stateStatus: CodingTaskSessionCloseoutStatus.SnapshotPersisted,
    },
    {
      name: "Lock release 终态 clock.now 抛错时回退旧时间戳",
      options: {
        checkpointFailures: [new HarnessError(HarnessErrorCode.LockUnavailable, "checkpoint")],
        releaseFailure: true,
        clockNowFailureAt: 3,
      },
      first: {
        resultStatus: ResultStatus.Failure,
        errorCode: HarnessErrorCode.CodingTaskSessionCloseoutLockReleaseUnknown,
      },
      stateStatus: CodingTaskSessionCloseoutStatus.OutcomeUnknown,
      updatedAt: "2026-07-26T00:00:03.000Z",
    },
    {
      name: "Coverage 与 Snapshot 内容绑定不一致时 Blocked 且不执行 checkpoint",
      options: { coverageTargetMismatch: true },
      first: {
        resultStatus: ResultStatus.Success,
        valueStatus: CodingTaskSessionCloseoutStatus.Blocked,
      },
      calls: { checkpointExecute: 0 },
    },
    {
      name: "Checkpoint bind digest 抛错后 OutcomeUnknown 且不再执行 checkpoint",
      options: { checkpointBindingDigestThrow: true },
      first: {
        resultStatus: ResultStatus.Success,
        valueStatus: CodingTaskSessionCloseoutStatus.OutcomeUnknown,
      },
      second: {
        resultStatus: ResultStatus.Success,
        valueStatus: CodingTaskSessionCloseoutStatus.OutcomeUnknown,
      },
      calls: { checkpointExecute: 1 },
    },
    {
      name: "Checkpoint bind clock.now 抛错时使用旧时间戳完成绑定",
      options: { clockNowFailureAt: 3 },
      first: {
        resultStatus: ResultStatus.Success,
        valueStatus: CodingTaskSessionCloseoutStatus.CheckpointBound,
      },
      stateStatus: CodingTaskSessionCloseoutStatus.CheckpointBound,
      updatedAt: "2026-07-26T00:00:03.000Z",
    },
  ] satisfies ReadonlyArray<CloseoutManagerFaultCase>)(
    "$name",
    async ({ options, first, second, calls, stateStatus, updatedAt }) => {
      const harness = createCloseoutManagerHarness(options);
      const command = createCloseoutManagerCommand();
      expectCloseoutManagerCase(await harness.manager.execute(command), first);
      if (second !== undefined) {
        expectCloseoutManagerCase(await harness.manager.execute(command), second);
      }
      if (calls !== undefined) expect(harness.calls).toMatchObject(calls);
      if (stateStatus !== undefined) expect(harness.state?.status).toBe(stateStatus);
      if (updatedAt !== undefined) expect(harness.state?.updatedAt).toBe(updatedAt);
    },
  );
});

/** 单个组合故障用例。 */
type CloseoutManagerFaultCase = {
  readonly name: string;
  readonly options: CloseoutManagerHarnessOptions;
  readonly first: CloseoutManagerCaseExpectation;
  readonly second?: CloseoutManagerCaseExpectation;
  readonly calls?: Partial<CloseoutManagerHarnessCalls>;
  readonly stateStatus?: CodingTaskSessionCloseoutStatus;
  readonly updatedAt?: string;
};

/** 单次 Manager 结果的最小断言。 */
type CloseoutManagerCaseExpectation = {
  readonly resultStatus: ResultStatus;
  readonly errorCode?: HarnessErrorCode;
  readonly valueStatus?: CodingTaskSessionCloseoutStatus;
};

function expectCloseoutManagerCase(
  result: Awaited<
    ReturnType<ReturnType<typeof createCloseoutManagerHarness>["manager"]["execute"]>
  >,
  expected: CloseoutManagerCaseExpectation,
): void {
  expect(result.status).toBe(expected.resultStatus);
  if (expected.errorCode !== undefined) {
    expect(result).toMatchObject({ error: { code: expected.errorCode } });
  }
  if (expected.valueStatus !== undefined) {
    expect(result).toMatchObject({ value: { status: expected.valueStatus } });
  }
}
