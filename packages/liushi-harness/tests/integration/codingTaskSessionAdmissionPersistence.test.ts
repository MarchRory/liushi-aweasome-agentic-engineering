import { lstat, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CodingTaskSessionAdmissionStateCreateDisposition,
  ParentDirectorySyncStatus,
} from "../../src/application/ports/index.js";
import {
  HarnessErrorCode,
  HarnessError,
  ResultStatus,
  parseContentDigest,
  type Result,
  type ContentDigest,
} from "../../src/common/index.js";
import {
  beginPending,
  createCodingTaskSessionAdmissionState,
  markOutcomeUnknown,
  type CodingTaskSessionAdmissionState,
} from "../../src/domain/codingTaskSession/index.js";
import { parseCodingTaskSessionId } from "../../src/domain/codingTaskSession/index.js";
import { parseWorkspaceId } from "../../src/domain/workspace/index.js";
import {
  ExclusiveFileLockManager,
  FileCodingTaskSessionAdmissionLease,
  FileCodingTaskSessionAdmissionStateStore,
  FileParentDirectoryDurability,
  type ExclusiveFileLockHandle,
  type FileLockManager,
  type ParentDirectoryDurability,
} from "../../src/infrastructure/index.js";

const workspaceId = parseWorkspaceId("workspace-1");
const sessionId = parseCodingTaskSessionId("01ARZ3NDEKTSV4RRFFQ69G5FAV");
if (workspaceId.status === ResultStatus.Failure) throw workspaceId.error;
if (sessionId.status === ResultStatus.Failure) throw sessionId.error;
const workspace = workspaceId.value;
const session = sessionId.value;

describe("File CodingTask Session Admission State/Lease", () => {
  it("create 幂等、跨实例 load 与 expectedVersion 冲突", async () => {
    const root = await mkdtemp(join(tmpdir(), "liushi-admission-"));
    try {
      const state = initialState();
      const first = createStore(root);
      const second = createStore(root);
      expect(unwrap(await first.create(state)).disposition).toBe(
        CodingTaskSessionAdmissionStateCreateDisposition.Created,
      );
      expect(unwrap(await second.create(state)).disposition).toBe(
        CodingTaskSessionAdmissionStateCreateDisposition.Reused,
      );
      const loaded = unwrap(await second.load(locator()));
      const pending = unwrap(
        beginPending(loaded, {
          actionId: "action-1",
          intentDigest: digest("a"),
          executorSessionIdDigest: digest("b"),
          updatedAt: "2026-07-23T00:00:01.000Z",
        }),
      );
      expect(
        unwrap(await first.replace({ expectedVersion: loaded.version, state: pending })).version,
      ).toBe(1);
      expect(
        (await second.replace({ expectedVersion: loaded.version, state: pending })).status,
      ).toBe(ResultStatus.Failure);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it.each(["invalid JSON", "unknown field"])("拒绝损坏文件：%s", async (kind) => {
    const root = await mkdtemp(join(tmpdir(), "liushi-admission-"));
    try {
      const state = initialState();
      const store = createStore(root);
      unwrap(await store.create(state));
      const file = join(
        root,
        "workspaces",
        workspace,
        "codingTaskSessions",
        session,
        "admission.json",
      );
      await writeFile(
        file,
        kind === "invalid JSON"
          ? "{\n"
          : `${JSON.stringify(state).slice(0, -1)},"unexpected":true}\n`,
        "utf8",
      );
      const loaded = await store.load(locator());
      expect(loaded.status).toBe(ResultStatus.Failure);
      if (loaded.status === ResultStatus.Success) return;
      expect(loaded.error.code).toBe(HarnessErrorCode.CorruptStore);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("replace 写入开始后父目录耐久化失败返回 outcome_unknown", async () => {
    const root = await mkdtemp(join(tmpdir(), "liushi-admission-"));
    const failingDurability: ParentDirectoryDurability = {
      syncParentDirectory: () => Promise.reject(new Error("injected durability failure")),
    };
    try {
      const state = initialState();
      const created = createStore(root);
      unwrap(await created.create(state));
      const pending = unwrap(
        beginPending(state, {
          actionId: "action-1",
          intentDigest: digest("a"),
          executorSessionIdDigest: digest("b"),
          updatedAt: "2026-07-23T00:00:01.000Z",
        }),
      );
      const failed = new FileCodingTaskSessionAdmissionStateStore(root, {
        parentDirectoryDurability: failingDurability,
      });
      const result = await failed.replace({ expectedVersion: state.version, state: pending });
      expect(result.status).toBe(ResultStatus.Failure);
      if (result.status === ResultStatus.Success) return;
      expect(result.error.code).toBe(
        HarnessErrorCode.CodingTaskSessionAdmissionCommitOutcomeUnknown,
      );
      expect(
        (
          await lstat(
            join(root, "workspaces", workspace, "codingTaskSessions", session, "admission.json"),
          )
        ).isFile(),
      ).toBe(true);
      expect(
        (
          await readFile(
            join(root, "workspaces", workspace, "codingTaskSessions", session, "admission.json"),
            "utf8",
          )
        ).length,
      ).toBeGreaterThan(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it.each([
    ["create", ParentDirectorySyncStatus.BestEffort],
    ["replace", ParentDirectorySyncStatus.BestEffort],
  ] as const)("%s 不得把 BestEffort 父目录状态报告为健康提交", async (operation, status) => {
    const root = await mkdtemp(join(tmpdir(), "liushi-admission-"));
    const durability: ParentDirectoryDurability = {
      syncParentDirectory: () => Promise.resolve({ status, reason: "injected-best-effort" }),
    };
    try {
      const healthy = createStore(root);
      const state = initialState();
      const store = new FileCodingTaskSessionAdmissionStateStore(root, {
        parentDirectoryDurability: durability,
      });
      const result =
        operation === "create"
          ? await store.create(state)
          : await (async () => {
              unwrap(await healthy.create(state));
              const pending = unwrap(
                beginPending(state, {
                  actionId: "action-best-effort",
                  intentDigest: digest("a"),
                  executorSessionIdDigest: digest("b"),
                  updatedAt: "2026-07-23T00:00:01.000Z",
                }),
              );
              return store.replace({ expectedVersion: state.version, state: pending });
            })();

      expect(result.status).toBe(ResultStatus.Failure);
      if (result.status === ResultStatus.Success) return;
      expect(result.error.code).toBe(
        HarnessErrorCode.CodingTaskSessionAdmissionCommitOutcomeUnknown,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("真实 File Store 可持久化并重建保留 Pending 证据的 outcome_unknown", async () => {
    const root = await mkdtemp(join(tmpdir(), "liushi-admission-"));
    try {
      const store = createStore(root);
      const state = initialState();
      unwrap(await store.create(state));
      const pending = unwrap(
        beginPending(state, {
          actionId: "action-unknown",
          intentDigest: digest("a"),
          executorSessionIdDigest: digest("b"),
          updatedAt: "2026-07-23T00:00:01.000Z",
        }),
      );
      unwrap(await store.replace({ expectedVersion: state.version, state: pending }));
      const unknown = unwrap(
        markOutcomeUnknown(pending, {
          updatedAt: "2026-07-23T00:00:02.000Z",
        }),
      );

      unwrap(await store.replace({ expectedVersion: pending.version, state: unknown }));
      const reloaded = unwrap(await createStore(root).load(locator()));

      expect(reloaded.status).toBe("outcome_unknown");
      expect(reloaded.pendingAdmission).toEqual(pending.pendingAdmission);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("真实跨实例 admission lease 串行并在释放后可重入", async () => {
    const root = await mkdtemp(join(tmpdir(), "liushi-admission-"));
    try {
      const first = new FileCodingTaskSessionAdmissionLease(root, {
        lockManager: new ExclusiveFileLockManager(),
      });
      const second = new FileCodingTaskSessionAdmissionLease(root, {
        lockManager: new ExclusiveFileLockManager(),
      });
      const held = unwrap(await first.acquire(locator()));
      expect((await second.acquire(locator())).status).toBe(ResultStatus.Failure);
      expect((await held.release()).status).toBe(ResultStatus.Success);
      const reacquired = await second.acquire(locator());
      expect(reacquired.status).toBe(ResultStatus.Success);
      if (reacquired.status === ResultStatus.Success)
        expect((await reacquired.value.release()).status).toBe(ResultStatus.Success);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("Admission Lease 竞争时只尝试一次并立即返回 LockUnavailable", async () => {
    const root = await mkdtemp(join(tmpdir(), "liushi-admission-"));
    const lockManager = new RejectingLockManager();
    try {
      const lease = new FileCodingTaskSessionAdmissionLease(root, { lockManager });

      const result = await lease.acquire(locator());

      expect(result.status).toBe(ResultStatus.Failure);
      if (result.status === ResultStatus.Success) return;
      expect(result.error.code).toBe(HarnessErrorCode.LockUnavailable);
      expect(lockManager.acquireCalls).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

/** 记录竞争路径调用次数的非等待 Lock Manager。 */
class RejectingLockManager implements FileLockManager {
  public acquireCalls = 0;

  public acquire(): Promise<ExclusiveFileLockHandle> {
    this.acquireCalls += 1;
    return Promise.reject(new HarnessError(HarnessErrorCode.LockUnavailable, "injected busy lock"));
  }
}

function createStore(root: string): FileCodingTaskSessionAdmissionStateStore {
  return new FileCodingTaskSessionAdmissionStateStore(root, {
    parentDirectoryDurability: new FileParentDirectoryDurability(),
  });
}

function initialState(): CodingTaskSessionAdmissionState {
  return unwrap(
    createCodingTaskSessionAdmissionState({
      workspaceId: workspace,
      sessionId: session,
      activationBindingDigest: digest("a"),
      sessionBindingDigest: digest("b"),
      updatedAt: "2026-07-23T00:00:00.000Z",
    }),
  );
}

function locator() {
  return { workspaceId: workspace, sessionId: session };
}

function digest(hexCharacter: string): ContentDigest {
  const parsed = parseContentDigest(`sha256:${hexCharacter.repeat(64)}`);
  if (parsed.status === ResultStatus.Failure) throw parsed.error;
  return parsed.value;
}

function unwrap<T>(result: Result<T, HarnessError>): T {
  if (result.status === ResultStatus.Failure) throw result.error;
  return result.value;
}
