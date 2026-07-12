import { describe, expect, it } from "vitest";

import { HarnessError, HarnessErrorCode } from "../../src/common/index.js";
import {
  EventLogCommitFailureStage,
  EventLogHandleStatus,
  commitEventBytes,
  type EventLogCommitHandle,
} from "../../src/infrastructure/persistence/fileEventStore/eventLog/index.js";

describe("Event Log 提交结果", () => {
  it.each([EventLogCommitFailureStage.Write, EventLogCommitFailureStage.Sync])(
    "%s 抛错时返回禁止自动重试的未知结果错误",
    async (stage) => {
      const handle =
        stage === EventLogCommitFailureStage.Sync
          ? new ControlledEventLogCommitHandle({ syncError: new Error("Injected sync failure.") })
          : new ControlledEventLogCommitHandle();
      const write =
        stage === EventLogCommitFailureStage.Write
          ? (): Promise<void> => Promise.reject(new Error("Injected write failure."))
          : (): Promise<void> => Promise.resolve();

      const error = await captureHarnessError(commitEventBytes(handle, write));

      expect(error.code).toBe(HarnessErrorCode.EventLogCommitOutcomeUnknown);
      expect(error.details).toEqual({ stage });
      expect(error.message).toContain("automatic retry is prohibited");
      expect(handle.closeCalls).toBe(1);
    },
  );

  it("write 与 close 均抛错时仍返回未知结果错误", async () => {
    const handle = new ControlledEventLogCommitHandle({
      closeError: new Error("Injected close failure."),
    });

    const error = await captureHarnessError(
      commitEventBytes(handle, () => Promise.reject(new Error("Injected write failure."))),
    );

    expect(error.code).toBe(HarnessErrorCode.EventLogCommitOutcomeUnknown);
    expect(error.details).toEqual({ stage: EventLogCommitFailureStage.Write });
    expect(error.cause).toBeInstanceOf(AggregateError);
    expect(handle.closeCalls).toBe(1);
  });

  it("sync 成功后 close 失败时保持 RecoveryRequired 提交成功语义", async () => {
    const handle = new ControlledEventLogCommitHandle({
      closeError: new Error("Injected close failure."),
    });

    const outcome = await commitEventBytes(handle, () => Promise.resolve());

    expect(outcome).toEqual({ handle: EventLogHandleStatus.RecoveryRequired });
    expect(handle.syncCalls).toBe(1);
    expect(handle.closeCalls).toBe(1);
  });

  it("写入、sync 与 close 成功时返回 Released", async () => {
    const handle = new ControlledEventLogCommitHandle();
    let writeCalls = 0;

    const outcome = await commitEventBytes(handle, () => {
      writeCalls += 1;
      return Promise.resolve();
    });

    expect(outcome).toEqual({ handle: EventLogHandleStatus.Released });
    expect(writeCalls).toBe(1);
    expect(handle.syncCalls).toBe(1);
    expect(handle.closeCalls).toBe(1);
  });
});

/** Event Log 句柄故障注入配置。 */
interface ControlledEventLogCommitHandleOptions {
  /** sync 抛出的故障。 */
  readonly syncError?: Error;
  /** close 抛出的故障。 */
  readonly closeError?: Error;
}

/** 用于确定性验证提交边界的内存句柄。 */
class ControlledEventLogCommitHandle implements EventLogCommitHandle {
  public syncCalls = 0;
  public closeCalls = 0;

  public constructor(private readonly options: ControlledEventLogCommitHandleOptions = {}) {}

  public sync(): Promise<void> {
    this.syncCalls += 1;
    if (this.options.syncError !== undefined) {
      return Promise.reject(this.options.syncError);
    }
    return Promise.resolve();
  }

  public close(): Promise<void> {
    this.closeCalls += 1;
    if (this.options.closeError !== undefined) {
      return Promise.reject(this.options.closeError);
    }
    return Promise.resolve();
  }
}

async function captureHarnessError(operation: Promise<unknown>): Promise<HarnessError> {
  try {
    await operation;
  } catch (error) {
    if (error instanceof HarnessError) {
      return error;
    }
    throw error;
  }
  throw new Error("Expected a HarnessError.");
}
