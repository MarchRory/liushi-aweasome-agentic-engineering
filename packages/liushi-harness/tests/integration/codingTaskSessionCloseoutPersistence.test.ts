import { mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CodingTaskSessionCloseoutStatus } from "../../src/application/codingTaskSessionCloseoutState/index.js";
import { CodingTaskSessionCloseoutStateCreateDisposition } from "../../src/application/ports/codingTaskSessionCloseoutStateStore/index.js";
import { ParentDirectorySyncStatus } from "../../src/application/ports/index.js";
import { HarnessErrorCode, ResultStatus } from "../../src/common/index.js";
import {
  assertCommitUnknown,
  blockedState,
  checkpointBoundState,
  CloseoutOperation,
  closeoutStateFile,
  createStore,
  digest,
  digestOf,
  initialState,
  legacyV1PersistedState,
  locator,
  outcomeUnknownCheckpointBoundState,
  persistedState,
  QueuedLockManager,
  RejectingLockManager,
  ReleaseFailureLockManager,
  secondLocator,
  secondSession,
  snapshot,
  unwrap,
  withTempRoot,
} from "../support/codingTaskSessionCloseout/index.js";
import { canonicalizeJson } from "../../src/infrastructure/serialization/index.js";

describe("File CodingTaskSession Closeout Store", () => {
  it("支持 Created、Reused、Conflict，并可跨实例 load", async () => {
    await withTempRoot(async (root) => {
      const first = createStore(root);
      const second = createStore(root);
      const state = initialState();
      expect(unwrap(await first.create(state)).disposition).toBe(
        CodingTaskSessionCloseoutStateCreateDisposition.Created,
      );
      expect(unwrap(await second.create(state)).disposition).toBe(
        CodingTaskSessionCloseoutStateCreateDisposition.Reused,
      );
      const progressed = persistedState(state, snapshot());
      expect(unwrap(await first.replace({ expectedVersion: 0, state: progressed })).version).toBe(
        1,
      );
      const resumed = unwrap(await second.create(state));
      expect(resumed.disposition).toBe(CodingTaskSessionCloseoutStateCreateDisposition.Reused);
      expect(resumed.state.version).toBe(1);
      const persistedJson = JSON.parse(await readFile(closeoutStateFile(root), "utf8")) as Record<
        string,
        unknown
      >;
      expect(persistedJson["coverageManifest"]).toMatchObject({
        manifestDigest: resumed.state.coverageManifest?.manifestDigest,
      });
      expect(persistedJson["coverageBindingDigest"]).toBe(resumed.state.coverageBindingDigest);
      expect(persistedJson).not.toHaveProperty("coveredActionIds");
      expect(persistedJson).not.toHaveProperty("actionEvidenceDigest");
      const conflict = await second.create(
        initialState({ requestDigest: unwrap(digest.calculate({ request: "different" })) }),
      );
      expect(unwrap(conflict).disposition).toBe(
        CodingTaskSessionCloseoutStateCreateDisposition.Conflict,
      );
      expect(unwrap(await second.load(locator))).toEqual(resumed.state);
    });
  });

  it("两个 Store 实例并发 replace 时恰好一个成功、另一个 VersionConflict", async () => {
    await withTempRoot(async (root) => {
      const lockManager = new QueuedLockManager();
      const first = createStore(root, { lockManager });
      const second = createStore(root, { lockManager });
      const state = initialState();
      unwrap(await first.create(state));
      const currentSnapshot = snapshot();
      const next = persistedState(state, currentSnapshot);
      const results = await Promise.all([
        first.replace({ expectedVersion: 0, state: next }),
        second.replace({ expectedVersion: 0, state: next }),
      ]);
      expect(results.filter((result) => result.status === ResultStatus.Success)).toHaveLength(1);
      expect(
        results.filter(
          (result) =>
            result.status === ResultStatus.Failure &&
            result.error.code === HarnessErrorCode.VersionConflict,
        ),
      ).toHaveLength(1);
    });
  });

  it("拒绝文件内容与 locator 身份不一致", async () => {
    await withTempRoot(async (root) => {
      const store = createStore(root);
      unwrap(await store.create(initialState()));
      const secondState = initialState({ sessionId: secondSession });
      unwrap(await store.create(secondState));
      await writeFile(
        closeoutStateFile(root),
        await readFile(closeoutStateFile(root, secondLocator)),
      );
      const result = await store.load(locator);
      expect(result).toMatchObject({
        status: ResultStatus.Failure,
        error: { code: HarnessErrorCode.CorruptStore },
      });
    });
  });

  it("Store 拒绝晚于 createdAt 但早于当前 v1 的候选，并保留原 v1", async () => {
    await withTempRoot(async (root) => {
      const store = createStore(root);
      const initial = initialState();
      unwrap(await store.create(initial));
      const v1 = persistedState(initial, snapshot());
      unwrap(await store.replace({ expectedVersion: 0, state: v1 }));
      const rejected = await store.replace({
        expectedVersion: 1,
        state: checkpointBoundState(v1, "2026-07-26T00:00:00.500Z"),
      });
      expect(rejected).toMatchObject({
        status: ResultStatus.Failure,
        error: { code: HarnessErrorCode.InvalidStateTransition },
      });
      expect(unwrap(await store.load(locator))).toEqual(v1);
    });
  });

  it("持久化终态后拒绝另一个合法终态候选且保持不变", async () => {
    await withTempRoot(async (root) => {
      const store = createStore(root);
      const initial = initialState();
      unwrap(await store.create(initial));
      const v1 = persistedState(initial, snapshot());
      unwrap(await store.replace({ expectedVersion: 0, state: v1 }));
      const terminal = blockedState(v1, "2026-07-26T00:00:02.000Z");
      unwrap(await store.replace({ expectedVersion: 1, state: terminal }));
      const rejected = await store.replace({
        expectedVersion: 2,
        state: outcomeUnknownCheckpointBoundState(terminal, "2026-07-26T00:00:03.000Z"),
      });
      expect(rejected).toMatchObject({
        status: ResultStatus.Failure,
        error: { code: HarnessErrorCode.InvalidStateTransition },
      });
      expect(unwrap(await store.load(locator))).toEqual(terminal);
    });
  });

  it.each(["invalid JSON", "unknown field"] as const)(
    "拒绝损坏 JSON 或未知字段：%s",
    async (kind) => {
      await withTempRoot(async (root) => {
        const store = createStore(root);
        const state = initialState();
        unwrap(await store.create(state));
        const stateFile = closeoutStateFile(root);
        await writeFile(
          stateFile,
          kind === "invalid JSON"
            ? "{\n"
            : `${JSON.stringify(state).slice(0, -1)},"unexpected":true}\n`,
          "utf8",
        );
        const result = await store.load(locator);
        expect(result.status).toBe(ResultStatus.Failure);
        if (result.status === ResultStatus.Failure)
          expect(result.error.code).toBe(HarnessErrorCode.CorruptStore);
      });
    },
  );

  it("拒绝 stateFile 为目录", async () => {
    await withTempRoot(async (root) => {
      const store = createStore(root);
      unwrap(await store.create(initialState()));
      const stateFile = closeoutStateFile(root);
      await rm(stateFile);
      await mkdir(stateFile);
      const directoryResult = await store.load(locator);
      expect(directoryResult.status).toBe(ResultStatus.Failure);
      if (directoryResult.status === ResultStatus.Failure)
        expect(directoryResult.error.code).toBe(HarnessErrorCode.CorruptStore);
    });
  });

  it("在平台支持时拒绝符号链接", async ({ skip }) => {
    await withTempRoot(async (root) => {
      const store = createStore(root);
      unwrap(await store.create(initialState()));
      const stateFile = closeoutStateFile(root);
      await rm(stateFile);
      try {
        await symlink(join(root, "missing-target"), stateFile);
      } catch (error) {
        if (
          error instanceof Error &&
          "code" in error &&
          ["EPERM", "EACCES", "UNKNOWN"].includes(String(error.code))
        ) {
          skip("当前平台不支持创建测试符号链接");
          return;
        }
        throw error;
      }
      const symlinkResult = await store.load(locator);
      expect(symlinkResult.status).toBe(ResultStatus.Failure);
      if (symlinkResult.status === ResultStatus.Failure)
        expect(symlinkResult.error.code).toBe(HarnessErrorCode.CorruptStore);
    });
  });

  it("旧 v1 完整弱证据只返回 PreconditionNotMet 且不覆盖文件", async () => {
    await withTempRoot(async (root) => {
      const store = createStore(root);
      const initial = initialState();
      unwrap(await store.create(initial));
      const legacy = legacyV1PersistedState(initial, snapshot());
      const bytes = `${canonicalizeJson(legacy)}\n`;
      await writeFile(closeoutStateFile(root), bytes, "utf8");

      const result = await store.load(locator);
      expect(result.status).toBe(ResultStatus.Failure);
      if (result.status === ResultStatus.Failure) {
        expect(result.error.code).toBe(HarnessErrorCode.PreconditionNotMet);
        expect(result.error.message).toContain("证据不足");
      }
      expect(await readFile(closeoutStateFile(root), "utf8")).toBe(bytes);
    });
  });

  it.each(["unknown field", "digest drift", "Closing time drift"] as const)(
    "损坏旧 v1 返回 CorruptStore：%s",
    async (kind) => {
      await withTempRoot(async (root) => {
        const store = createStore(root);
        const initial = initialState();
        unwrap(await store.create(initial));
        const legacy = legacyV1PersistedState(initial, snapshot());
        const damaged =
          kind === "unknown field"
            ? { ...legacy, unexpected: true }
            : kind === "digest drift"
              ? { ...legacy, actionEvidenceDigest: digestOf("drift") }
              : {
                  ...legacy,
                  status: CodingTaskSessionCloseoutStatus.Closing,
                  snapshot: null,
                  coveredActionIds: [],
                  actionEvidenceDigest: null,
                  version: 0,
                };
        await writeFile(closeoutStateFile(root), `${canonicalizeJson(damaged)}\n`, "utf8");

        const result = await store.load(locator);
        expect(result).toMatchObject({
          status: ResultStatus.Failure,
          error: { code: HarnessErrorCode.CorruptStore },
        });
      });
    },
  );

  it("旧 v1 locator 漂移仍返回 CorruptStore", async () => {
    await withTempRoot(async (root) => {
      const store = createStore(root);
      const initial = initialState();
      const drifted = initialState({ sessionId: secondSession });
      unwrap(await store.create(initial));
      const legacy = legacyV1PersistedState(drifted, snapshot());
      await writeFile(closeoutStateFile(root), `${canonicalizeJson(legacy)}\n`, "utf8");

      const result = await store.load(locator);
      expect(result).toMatchObject({
        status: ResultStatus.Failure,
        error: { code: HarnessErrorCode.CorruptStore },
      });
    });
  });

  it("LockUnavailable 只尝试一次，且保留锁释放失败时的原操作语义", async () => {
    await withTempRoot(async (root) => {
      const rejecting = new RejectingLockManager();
      const unavailable = await createStore(root, { lockManager: rejecting }).create(
        initialState(),
      );
      expect(unavailable.status).toBe(ResultStatus.Failure);
      expect(rejecting.calls).toBe(1);
      if (unavailable.status === ResultStatus.Failure)
        expect(unavailable.error.code).toBe(HarnessErrorCode.LockUnavailable);

      const releaseFailure = new ReleaseFailureLockManager();
      const store = createStore(root, { lockManager: releaseFailure });
      const result = await store.create(initialState());
      expect(result.status).toBe(ResultStatus.Failure);
      if (result.status === ResultStatus.Failure)
        expect(result.error.code).toBe(
          HarnessErrorCode.CodingTaskSessionCloseoutLockReleaseUnknown,
        );

      const healthy = createStore(root);
      const existing = initialState();
      unwrap(await healthy.create(existing));
      const next = persistedState(existing, snapshot());
      const operationFailure = await store.replace({
        expectedVersion: 0,
        state: {
          ...next,
          requestDigest: unwrap(digest.calculate({ request: "replacement-identity" })),
        },
      });
      expect(operationFailure.status).toBe(ResultStatus.Failure);
      if (operationFailure.status === ResultStatus.Failure) {
        expect(operationFailure.error.code).toBe(
          HarnessErrorCode.CodingTaskSessionCloseoutLockReleaseUnknown,
        );
        expect(operationFailure.error.details["operationErrorCode"]).toBe(
          HarnessErrorCode.PreconditionNotMet,
        );
        expect(operationFailure.error.cause).toBeInstanceOf(AggregateError);
      }
    });
  });

  it.each([
    [CloseoutOperation.Create, ParentDirectorySyncStatus.BestEffort],
    [CloseoutOperation.Replace, ParentDirectorySyncStatus.BestEffort],
  ] as const)("%s 遇到 %s 时返回 CommitOutcomeUnknown", async (operation, status) => {
    await assertCommitUnknown(operation, { status, reason: "injected" });
  });

  it.each([CloseoutOperation.Create, CloseoutOperation.Replace])(
    "%s 遇到父目录耐久异常时返回 CommitOutcomeUnknown",
    async (operation) => {
      await assertCommitUnknown(operation, undefined, true);
    },
  );
});
