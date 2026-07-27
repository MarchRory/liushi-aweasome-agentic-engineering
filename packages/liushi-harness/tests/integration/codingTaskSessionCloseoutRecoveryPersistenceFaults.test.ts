import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { HarnessErrorCode, ResultStatus } from "../../src/common/index.js";
import { ExclusiveFileLockManager } from "../../src/infrastructure/index.js";
import type { ParentDirectoryDurability } from "../../src/infrastructure/persistence/fileEventStore/index.js";
import {
  bestEffortOutcome,
  createStore,
  executingRecoveryState,
  FixedParentDirectoryDurability,
  initialRecoveryState,
  RejectingLockManager,
  ReleaseFailureLockManager,
  recoveryLockFile,
  recoveryLocator,
  unwrapResult,
  withTempRoot,
} from "../support/codingTaskSessionCloseoutRecovery/codingTaskSessionCloseoutRecoveryPersistenceFixture.js";
import { digestOf } from "../support/codingTaskSessionCloseout/index.js";

describe("FileCodingTaskSessionCloseoutRecoveryStore fault boundaries", () => {
  it("真实独占锁被持有时返回 LockUnavailable 且不修改 State", async () => {
    await withTempRoot(async (root) => {
      const store = createStore(root);
      const initial = initialRecoveryState();
      unwrapResult(await store.create(initial));
      const lockManager = new ExclusiveFileLockManager();
      const lock = await lockManager.acquire(recoveryLockFile(root), {
        workspaceId: recoveryLocator.workspaceId,
        taskId: recoveryLocator.sessionId,
      });

      try {
        const result = await store.replace({
          expectedVersion: 0,
          state: executingRecoveryState(initial),
        });
        expect(result).toMatchObject({
          status: ResultStatus.Failure,
          error: { code: HarnessErrorCode.LockUnavailable },
        });
        expect(unwrapResult(await store.load(recoveryLocator))).toEqual(initial);
      } finally {
        await lock.release();
      }

      expect(
        unwrapResult(
          await store.replace({
            expectedVersion: 0,
            state: executingRecoveryState(initial),
          }),
        ).version,
      ).toBe(1);
    });
  });

  it("LockUnavailable 只尝试一次，不隐式重试", async () => {
    await withTempRoot(async (root) => {
      const lockManager = new RejectingLockManager();
      const result = await createStore(root, { lockManager }).create(initialRecoveryState());

      expect(result).toMatchObject({
        status: ResultStatus.Failure,
        error: { code: HarnessErrorCode.LockUnavailable },
      });
      expect(lockManager.calls).toBe(1);
      expect(unwrapResult(await createStore(root).find(recoveryLocator))).toBeNull();
    });
  });

  it("锁释放结果未知使用 Recovery 专属稳定错误码", async () => {
    await withTempRoot(async (root) => {
      const result = await createStore(root, {
        lockManager: new ReleaseFailureLockManager(),
      }).create(initialRecoveryState());

      expect(result).toMatchObject({
        status: ResultStatus.Failure,
        error: { code: HarnessErrorCode.CodingTaskSessionCloseoutRecoveryLockReleaseUnknown },
      });
    });
  });

  it("锁释放未知会保留锁内 operation 的失败语义", async () => {
    await withTempRoot(async (root) => {
      const healthy = createStore(root);
      const initial = initialRecoveryState();
      unwrapResult(await healthy.create(initial));
      const candidate = {
        ...executingRecoveryState(initial),
        requestDigest: digestOf({ request: "identity-drift" }),
      };

      const result = await createStore(root, {
        lockManager: new ReleaseFailureLockManager(),
      }).replace({ expectedVersion: 0, state: candidate });

      expect(result).toMatchObject({
        status: ResultStatus.Failure,
        error: {
          code: HarnessErrorCode.CodingTaskSessionCloseoutRecoveryLockReleaseUnknown,
          details: { operationErrorCode: HarnessErrorCode.PreconditionNotMet },
        },
      });
      if (result.status === ResultStatus.Failure) {
        expect(result.error.cause).toBeInstanceOf(AggregateError);
      }
      expect(unwrapResult(await healthy.load(recoveryLocator))).toEqual(initial);
    });
  });

  it("create 的父目录耐久化未知结果禁止自动重试", async () => {
    await withTempRoot(async (root) => {
      const result = await createStore(root, {
        parentDirectoryDurability: new FixedParentDirectoryDurability(bestEffortOutcome()),
      }).create(initialRecoveryState());

      expect(result).toMatchObject({
        status: ResultStatus.Failure,
        error: { code: HarnessErrorCode.CodingTaskSessionCloseoutRecoveryCommitOutcomeUnknown },
      });
    });
  });

  it("replace 的父目录耐久化未知结果保留已写入的结果语义", async () => {
    await withTempRoot(async (root) => {
      const healthy = createStore(root);
      const initial = initialRecoveryState();
      unwrapResult(await healthy.create(initial));

      const result = await createStore(root, {
        parentDirectoryDurability: new FixedParentDirectoryDurability(bestEffortOutcome()),
      }).replace({ expectedVersion: 0, state: executingRecoveryState(initial) });

      expect(result).toMatchObject({
        status: ResultStatus.Failure,
        error: { code: HarnessErrorCode.CodingTaskSessionCloseoutRecoveryCommitOutcomeUnknown },
      });
      expect(unwrapResult(await healthy.load(recoveryLocator)).version).toBe(1);
    });
  });

  it("create/replace 的父目录异常同样映射为提交结果未知", async () => {
    await withTempRoot(async (root) => {
      const rejectingDurability: ParentDirectoryDurability = {
        syncParentDirectory: () => Promise.reject(new Error("injected durability failure")),
      };
      const createResult = await createStore(root, {
        parentDirectoryDurability: rejectingDurability,
      }).create(initialRecoveryState());
      expect(createResult).toMatchObject({
        status: ResultStatus.Failure,
        error: { code: HarnessErrorCode.CodingTaskSessionCloseoutRecoveryCommitOutcomeUnknown },
      });

      const secondRoot = join(root, "replace-root");
      await mkdir(secondRoot);
      const healthy = createStore(secondRoot);
      const initial = initialRecoveryState();
      unwrapResult(await healthy.create(initial));
      const replaceResult = await createStore(secondRoot, {
        parentDirectoryDurability: rejectingDurability,
      }).replace({ expectedVersion: 0, state: executingRecoveryState(initial) });
      expect(replaceResult).toMatchObject({
        status: ResultStatus.Failure,
        error: { code: HarnessErrorCode.CodingTaskSessionCloseoutRecoveryCommitOutcomeUnknown },
      });
    });
  });
});
