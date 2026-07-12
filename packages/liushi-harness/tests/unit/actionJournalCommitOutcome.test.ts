import { describe, expect, it } from "vitest";

import { HarnessError, HarnessErrorCode } from "../../src/common/index.js";
import {
  ActionJournalCommitFailureStage,
  ActionJournalHandleStatus,
  commitActionJournalBytes,
  type ActionJournalCommitHandle,
} from "../../src/infrastructure/persistence/fileEventStore/actionJournal/index.js";

describe("Action Journal 提交边界", () => {
  it.each([ActionJournalCommitFailureStage.Write, ActionJournalCommitFailureStage.Sync])(
    "%s 失败时返回禁止自动重试的未知结果",
    async (stage) => {
      const handle =
        stage === ActionJournalCommitFailureStage.Sync
          ? new ControlledActionJournalHandle({ syncError: new Error("sync failure") })
          : new ControlledActionJournalHandle();
      const write =
        stage === ActionJournalCommitFailureStage.Write
          ? (): Promise<void> => Promise.reject(new Error("write failure"))
          : (): Promise<void> => Promise.resolve();

      const error = await captureHarnessError(commitActionJournalBytes(handle, write));

      expect(error.code).toBe(HarnessErrorCode.ActionJournalCommitOutcomeUnknown);
      expect(error.details).toEqual({ stage });
      expect(handle.closeCalls).toBe(1);
    },
  );

  it("fsync 成功但 close 失败时保持已提交恢复语义", async () => {
    const handle = new ControlledActionJournalHandle({
      closeError: new Error("close failure"),
    });

    const result = await commitActionJournalBytes(handle, () => Promise.resolve());

    expect(result.handle).toBe(ActionJournalHandleStatus.RecoveryRequired);
  });

  it("write、fsync 和 close 成功时返回 Released", async () => {
    const handle = new ControlledActionJournalHandle();

    const result = await commitActionJournalBytes(handle, () => Promise.resolve());

    expect(result.handle).toBe(ActionJournalHandleStatus.Released);
    expect(handle.syncCalls).toBe(1);
    expect(handle.closeCalls).toBe(1);
  });
});

/** Action Journal 文件句柄故障注入配置。 */
interface ControlledActionJournalHandleOptions {
  /** fsync 需要抛出的故障。 */
  readonly syncError?: Error;
  /** close 需要抛出的故障。 */
  readonly closeError?: Error;
}

/** 用于验证提交边界的内存文件句柄。 */
class ControlledActionJournalHandle implements ActionJournalCommitHandle {
  public syncCalls = 0;
  public closeCalls = 0;

  public constructor(private readonly options: ControlledActionJournalHandleOptions = {}) {}

  public sync(): Promise<void> {
    this.syncCalls += 1;
    return this.options.syncError === undefined
      ? Promise.resolve()
      : Promise.reject(this.options.syncError);
  }

  public close(): Promise<void> {
    this.closeCalls += 1;
    return this.options.closeError === undefined
      ? Promise.resolve()
      : Promise.reject(this.options.closeError);
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
  throw new Error("测试预期捕获 HarnessError。");
}
