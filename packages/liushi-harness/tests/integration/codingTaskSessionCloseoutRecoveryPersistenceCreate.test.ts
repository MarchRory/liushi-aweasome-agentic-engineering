import { lstat, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  CodingTaskSessionCloseoutRecoveryResolution,
  CodingTaskSessionCloseoutRecoveryStateStatus,
} from "../../src/application/codingTaskSessionCloseoutRecovery/index.js";
import { CodingTaskSessionCloseoutRecoveryStateCreateDisposition } from "../../src/application/ports/index.js";
import { HarnessErrorCode, ResultStatus } from "../../src/common/index.js";
import { canonicalizeJson } from "../../src/infrastructure/serialization/index.js";
import {
  closeoutStateFile,
  createStore,
  executingRecoveryState,
  initialRecoveryState,
  recoveryLocator,
  recoveryStateFile,
  recoveryLockFile,
  readText,
  unwrapResult,
  withTempRoot,
  writeAdjacentCloseout,
} from "../support/codingTaskSessionCloseoutRecovery/codingTaskSessionCloseoutRecoveryPersistenceFixture.js";
import { approvedRecoveryState } from "../support/codingTaskSessionCloseoutRecovery/codingTaskSessionCloseoutRecoveryStateFixture.js";
import { digest } from "../support/codingTaskSessionCloseout/codingTaskSessionCloseoutStateFixture.js";

describe("FileCodingTaskSessionCloseoutRecoveryStore create/load", () => {
  it("发布精确 Recovery 文件和独立锁路径，并保持邻接 closeout.json 字节不变", async () => {
    await withTempRoot(async (root) => {
      const originalCloseout = await writeAdjacentCloseout(root);
      const state = initialRecoveryState();
      const store = createStore(root);

      const created = unwrapResult(await store.create(state));

      expect(created.disposition).toBe(
        CodingTaskSessionCloseoutRecoveryStateCreateDisposition.Created,
      );
      expect(created.state).toEqual(state);
      expect(await readFile(recoveryStateFile(root), "utf8")).toBe(`${canonicalizeJson(state)}\n`);
      expect(await readText(closeoutStateFile(root))).toBe(originalCloseout);
      await expect(lstat(recoveryLockFile(root))).rejects.toMatchObject({ code: "ENOENT" });
    });
  });

  it("支持跨实例 load、find 和缺失记录语义", async () => {
    await withTempRoot(async (root) => {
      const first = createStore(root);
      const second = createStore(root);
      const state = initialRecoveryState();

      expect(unwrapResult(await first.find(recoveryLocator))).toBeNull();
      const missing = await first.load(recoveryLocator);
      expect(missing).toMatchObject({
        status: ResultStatus.Failure,
        error: { code: HarnessErrorCode.PreconditionNotMet },
      });

      unwrapResult(await first.create(state));
      expect(unwrapResult(await second.load(recoveryLocator))).toEqual(state);
      expect(unwrapResult(await second.find(recoveryLocator))).toEqual(state);
    });
  });

  it("同一完整身份在已有进度后返回 Reused，身份变化返回 Conflict 且不覆盖进度", async () => {
    await withTempRoot(async (root) => {
      const first = createStore(root);
      const second = createStore(root);
      const state = initialRecoveryState();
      unwrapResult(await first.create(state));

      const progressed = executingRecoveryState(state);
      unwrapResult(await first.replace({ expectedVersion: 0, state: progressed }));

      const reused = unwrapResult(await second.create(state));
      expect(reused.disposition).toBe(
        CodingTaskSessionCloseoutRecoveryStateCreateDisposition.Reused,
      );
      expect(reused.state.status).toBe(CodingTaskSessionCloseoutRecoveryStateStatus.Executing);
      expect(reused.state.version).toBe(1);

      const conflicting = approvedRecoveryState(
        CodingTaskSessionCloseoutRecoveryResolution.RetryOnce,
        { requestDigest: unwrapResult(digest.calculate({ command: "different" })) },
      );
      const conflict = unwrapResult(await second.create(conflicting));
      expect(conflict.disposition).toBe(
        CodingTaskSessionCloseoutRecoveryStateCreateDisposition.Conflict,
      );
      expect(conflict.state).toEqual(progressed);
      expect(unwrapResult(await second.load(recoveryLocator))).toEqual(progressed);
    });
  });

  it("create 只接受严格 Approved v0", async () => {
    await withTempRoot(async (root) => {
      const result = await createStore(root).create(executingRecoveryState());

      expect(result).toMatchObject({
        status: ResultStatus.Failure,
        error: { code: HarnessErrorCode.InvalidInput },
      });
    });
  });
});
