import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  FileCodingTaskSessionActivationLease,
  ExclusiveFileLockManager,
} from "../../src/infrastructure/index.js";
import { parseCodingTaskSessionId } from "../../src/domain/codingTaskSession/index.js";
import { parseWorkspaceId } from "../../src/domain/workspace/index.js";
import { ResultStatus, HarnessError, HarnessErrorCode } from "../../src/common/index.js";

const workspaceId = parseWorkspaceId("workspace-1");
const sessionOne = parseCodingTaskSessionId("01ARZ3NDEKTSV4RRFFQ69G5FAV");
const sessionTwo = parseCodingTaskSessionId("01ARZ3NDEKTSV4RRFFQ69G5FAW");

if (workspaceId.status === ResultStatus.Failure) throw workspaceId.error;
if (sessionOne.status === ResultStatus.Failure) throw sessionOne.error;
if (sessionTwo.status === ResultStatus.Failure) throw sessionTwo.error;

describe("File CodingTask Session Activation Lease", () => {
  it("同一 Session 跨实例互斥，不同 Session 不互斥，释放后可重新获取", async () => {
    const root = await mkdtemp(join(tmpdir(), "liushi-activation-lease-"));
    try {
      const manager = new ExclusiveFileLockManager();
      const first = new FileCodingTaskSessionActivationLease(root, { lockManager: manager });
      const second = new FileCodingTaskSessionActivationLease(root, { lockManager: manager });
      const locator = { workspaceId: workspaceId.value, sessionId: sessionOne.value };
      const held = await first.acquire(locator);
      expect(held.status).toBe(ResultStatus.Success);
      if (held.status === ResultStatus.Failure) return;

      const sameSession = await second.acquire(locator);
      expect(sameSession.status).toBe(ResultStatus.Failure);
      if (sameSession.status === ResultStatus.Success) await sameSession.value.release();

      const differentSession = await second.acquire({
        workspaceId: workspaceId.value,
        sessionId: sessionTwo.value,
      });
      expect(differentSession.status).toBe(ResultStatus.Success);
      if (differentSession.status === ResultStatus.Success) {
        expect((await differentSession.value.release()).status).toBe(ResultStatus.Success);
      }

      expect((await held.value.release()).status).toBe(ResultStatus.Success);
      const reacquired = await second.acquire(locator);
      expect(reacquired.status).toBe(ResultStatus.Success);
      if (reacquired.status === ResultStatus.Success) {
        expect((await reacquired.value.release()).status).toBe(ResultStatus.Success);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("锁不可用时可返回失败而不触发应用命令", async () => {
    const calls: string[] = [];
    const unavailable = {
      acquire: () =>
        Promise.resolve({
          status: ResultStatus.Failure,
          error: new HarnessError(HarnessErrorCode.LockUnavailable, "held"),
        } as const),
    };
    expect((await unavailable.acquire()).status).toBe(ResultStatus.Failure);
    expect(calls).toEqual([]);
  });
});
