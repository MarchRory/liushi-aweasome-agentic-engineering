import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { HarnessErrorCode, ResultStatus, createHarnessApplication } from "../../src/index.js";
import { FixedClock, FixedSequenceIdGenerator } from "../support/runtime/index.js";

const stores: string[] = [];

afterEach(async () => {
  await Promise.all(
    stores.splice(0).map((storeRoot) => rm(storeRoot, { recursive: true, force: true })),
  );
});

describe("Repository Lock", () => {
  it("同一 Workspace/Repository 互斥，释放后可再次获取且句柄释放幂等", async () => {
    const storeRoot = await createStore();
    const app = createHarnessApplication({
      storeRoot,
      clock: new FixedClock("2026-07-12T00:00:00.000Z"),
      repositoryLockIdGenerator: new FixedSequenceIdGenerator(["lock-1", "lock-2"]),
    });

    const first = await app.acquireRepositoryLock.execute({
      workspaceId: "workspace-a",
      repositoryId: "repository-a",
      holderId: "coding-task-1",
    });
    expect(first.status).toBe(ResultStatus.Success);
    if (first.status === ResultStatus.Failure) return;
    expect(first.value.lockId).toBe("lock-1");

    const competing = await app.acquireRepositoryLock.execute({
      workspaceId: "workspace-a",
      repositoryId: "repository-a",
      holderId: "coding-task-2",
    });
    expect(competing.status).toBe(ResultStatus.Failure);
    if (competing.status === ResultStatus.Failure) {
      expect(competing.error.code).toBe(HarnessErrorCode.LockUnavailable);
      expect(competing.error.details).not.toHaveProperty("lockFile");
    }

    const released = await first.value.release();
    expect(released.status).toBe(ResultStatus.Success);
    expect((await first.value.release()).status).toBe(ResultStatus.Success);

    const reacquired = await app.acquireRepositoryLock.execute({
      workspaceId: "workspace-a",
      repositoryId: "repository-a",
      holderId: "coding-task-2",
    });
    expect(reacquired.status).toBe(ResultStatus.Success);
    if (reacquired.status === ResultStatus.Success) {
      expect(reacquired.value.lockId).toBe("lock-2");
      expect((await reacquired.value.release()).status).toBe(ResultStatus.Success);
    }
  });

  it("拒绝不安全的持有者标识", async () => {
    const storeRoot = await createStore();
    const app = createHarnessApplication({ storeRoot });

    const result = await app.acquireRepositoryLock.execute({
      workspaceId: "workspace-a",
      repositoryId: "repository-a",
      holderId: "../outside",
    });

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Failure) {
      expect(result.error.code).toBe(HarnessErrorCode.InvalidInput);
      expect(result.error.details).toEqual({ field: "holderId" });
    }
  });
});

async function createStore(): Promise<string> {
  const storeRoot = await mkdtemp(join(tmpdir(), "liushi-repository-lock-"));
  stores.push(storeRoot);
  return storeRoot;
}
