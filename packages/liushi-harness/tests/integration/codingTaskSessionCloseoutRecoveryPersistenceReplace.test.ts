import { describe, expect, it } from "vitest";

import {
  bindExistingCodingTaskSessionCloseoutRecoveryCheckpoint,
  CodingTaskSessionCloseoutRecoveryResolution,
  CodingTaskSessionCloseoutRecoveryStateStatus,
} from "../../src/application/codingTaskSessionCloseoutRecovery/index.js";
import { HarnessErrorCode, ResultStatus } from "../../src/common/index.js";
import {
  createStore,
  executingRecoveryState,
  initialRecoveryState,
  QueuedLockManager,
  recoveryLocator,
  unwrapResult,
  withTempRoot,
} from "../support/codingTaskSessionCloseoutRecovery/codingTaskSessionCloseoutRecoveryPersistenceFixture.js";
import {
  approvedRecoveryState,
  checkpointInput,
  unwrap,
} from "../support/codingTaskSessionCloseoutRecovery/codingTaskSessionCloseoutRecoveryStateFixture.js";
import {
  digest,
  secondLocator,
} from "../support/codingTaskSessionCloseout/codingTaskSessionCloseoutStateFixture.js";

describe("FileCodingTaskSessionCloseoutRecoveryStore replace", () => {
  it("在同一锁内重读 current，完成 RetryOnce 的 CAS successor", async () => {
    await withTempRoot(async (root) => {
      const store = createStore(root);
      const initial = initialRecoveryState();
      unwrapResult(await store.create(initial));

      const executing = executingRecoveryState(initial);
      const replaced = unwrapResult(await store.replace({ expectedVersion: 0, state: executing }));

      expect(replaced.status).toBe(CodingTaskSessionCloseoutRecoveryStateStatus.Executing);
      expect(replaced.version).toBe(1);
      expect(unwrapResult(await store.load(recoveryLocator))).toEqual(executing);
    });
  });

  it("持久化 BindExisting 的完整 Checkpoint，并拒绝身份漂移 successor", async () => {
    await withTempRoot(async (root) => {
      const store = createStore(root);
      const initial = approvedRecoveryState(
        CodingTaskSessionCloseoutRecoveryResolution.BindExisting,
      );
      unwrapResult(await store.create(initial));
      const bound = unwrap(
        bindExistingCodingTaskSessionCloseoutRecoveryCheckpoint(initial, checkpointInput(), digest),
      );

      const persisted = unwrapResult(await store.replace({ expectedVersion: 0, state: bound }));
      expect(persisted.status).toBe(CodingTaskSessionCloseoutRecoveryStateStatus.CheckpointBound);
      expect(persisted.checkpoint).not.toBeNull();
      expect(unwrapResult(await store.load(recoveryLocator))).toEqual(bound);

      const driftInitial = approvedRecoveryState(
        CodingTaskSessionCloseoutRecoveryResolution.RetryOnce,
        {
          sessionId: secondLocator.sessionId,
          requestDigest: unwrapResult(digest.calculate({ command: "drift-initial" })),
        },
      );
      const driftCandidate = executingRecoveryState(
        approvedRecoveryState(CodingTaskSessionCloseoutRecoveryResolution.RetryOnce, {
          sessionId: secondLocator.sessionId,
          requestDigest: unwrapResult(digest.calculate({ command: "identity-drift" })),
        }),
      );
      unwrapResult(await store.create(driftInitial));
      const rejected = await store.replace({ expectedVersion: 0, state: driftCandidate });
      expect(rejected).toMatchObject({
        status: ResultStatus.Failure,
        error: { code: HarnessErrorCode.PreconditionNotMet },
      });
      expect(unwrapResult(await store.load(secondLocator))).toEqual(driftInitial);
      expect(unwrapResult(await store.load(recoveryLocator))).toEqual(bound);
    });
  });

  it("版本不匹配返回 VersionConflict，且不覆盖 current", async () => {
    await withTempRoot(async (root) => {
      const store = createStore(root);
      const initial = initialRecoveryState();
      unwrapResult(await store.create(initial));
      const executing = executingRecoveryState(initial);
      unwrapResult(await store.replace({ expectedVersion: 0, state: executing }));

      const stale = await store.replace({ expectedVersion: 0, state: executing });
      expect(stale).toMatchObject({
        status: ResultStatus.Failure,
        error: { code: HarnessErrorCode.VersionConflict },
      });
      expect(unwrapResult(await store.load(recoveryLocator))).toEqual(executing);
    });
  });

  it("两个实例并发 replace 恰好一个成功，另一个返回 VersionConflict", async () => {
    await withTempRoot(async (root) => {
      const lockManager = new QueuedLockManager();
      const first = createStore(root, { lockManager });
      const second = createStore(root, { lockManager });
      const initial = initialRecoveryState();
      unwrapResult(await first.create(initial));
      const candidate = executingRecoveryState(initial);

      const results = await Promise.all([
        first.replace({ expectedVersion: 0, state: candidate }),
        second.replace({ expectedVersion: 0, state: candidate }),
      ]);

      expect(results.filter((result) => result.status === ResultStatus.Success)).toHaveLength(1);
      expect(
        results.filter(
          (result) =>
            result.status === ResultStatus.Failure &&
            result.error.code === HarnessErrorCode.VersionConflict,
        ),
      ).toHaveLength(1);
      expect(unwrapResult(await first.load(recoveryLocator))).toEqual(candidate);
    });
  });

  it("拒绝不可表示的版本和非法 successor 输入", async () => {
    await withTempRoot(async (root) => {
      const store = createStore(root);
      const initial = initialRecoveryState();
      unwrapResult(await store.create(initial));
      const executing = executingRecoveryState(initial);

      const wrongVersion = await store.replace({ expectedVersion: 2, state: executing });
      expect(wrongVersion).toMatchObject({
        status: ResultStatus.Failure,
        error: { code: HarnessErrorCode.InvalidInput },
      });

      const overflow = await store.replace({
        expectedVersion: Number.MAX_SAFE_INTEGER,
        state: executing,
      });
      expect(overflow).toMatchObject({
        status: ResultStatus.Failure,
        error: { code: HarnessErrorCode.InvalidInput },
      });
      expect(unwrapResult(await store.load(recoveryLocator))).toEqual(initial);
    });
  });
});
