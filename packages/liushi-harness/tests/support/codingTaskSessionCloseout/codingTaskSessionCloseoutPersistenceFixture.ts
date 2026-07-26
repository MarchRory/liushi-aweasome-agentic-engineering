import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ParentDirectorySyncStatus } from "../../../src/application/ports/index.js";
import {
  ExclusiveFileLockManager,
  FileCodingTaskSessionCloseoutStore,
  FileParentDirectoryDurability,
} from "../../../src/infrastructure/index.js";
import type { FileCodingTaskSessionCloseoutStoreDependencies } from "../../../src/infrastructure/persistence/fileCodingTaskSessionCloseoutStore/index.js";
import { HarnessError, HarnessErrorCode, ResultStatus } from "../../../src/common/index.js";
import type {
  ExclusiveFileLockHandle,
  FileLockManager,
  ParentDirectoryDurability,
} from "../../../src/infrastructure/persistence/fileEventStore/index.js";
import {
  digest,
  initialState,
  locator,
  persistedState,
  snapshot,
  unwrap,
} from "./codingTaskSessionCloseoutStateFixture.js";

export function closeoutStateFile(root: string, target = locator): string {
  return join(
    root,
    "workspaces",
    target.workspaceId,
    "codingTaskSessions",
    target.sessionId,
    "closeout.json",
  );
}

export function createStore(
  storeRoot: string,
  overrides: Partial<FileCodingTaskSessionCloseoutStoreDependencies> = {},
): FileCodingTaskSessionCloseoutStore {
  return new FileCodingTaskSessionCloseoutStore(storeRoot, {
    digest,
    lockManager: new ExclusiveFileLockManager(),
    parentDirectoryDurability: new FileParentDirectoryDurability(),
    ...overrides,
  });
}

export async function withTempRoot<T>(callback: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "liushi-closeout-"));
  try {
    return await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

export class RejectingLockManager implements FileLockManager {
  public calls = 0;

  public acquire(): Promise<ExclusiveFileLockHandle> {
    this.calls += 1;
    return Promise.reject(new HarnessError(HarnessErrorCode.LockUnavailable, "injected busy lock"));
  }
}

export class ReleaseFailureLockManager implements FileLockManager {
  public acquire(): Promise<ExclusiveFileLockHandle> {
    return Promise.resolve({
      release: () => Promise.reject(new Error("injected release failure")),
    });
  }
}

export class QueuedLockManager implements FileLockManager {
  private tail = Promise.resolve();

  public acquire(): Promise<ExclusiveFileLockHandle> {
    let releaseTurn!: () => void;
    const turn = new Promise<void>((resolve) => {
      releaseTurn = resolve;
    });
    const acquired = this.tail.then(() => ({
      release: () => {
        releaseTurn();
        return Promise.resolve();
      },
    }));
    this.tail = this.tail.then(() => turn);
    return acquired;
  }
}

/** 持久化测试覆盖的 Closeout 操作。 */
export enum CloseoutOperation {
  /** 测试创建路径。 */
  Create = "create",
  /** 测试替换路径。 */
  Replace = "replace",
}

export async function assertCommitUnknown(
  operation: CloseoutOperation,
  outcome?: { status: ParentDirectorySyncStatus; reason: string },
  reject = false,
): Promise<void> {
  await withTempRoot(async (root) => {
    const durability: ParentDirectoryDurability = {
      syncParentDirectory: () =>
        reject
          ? Promise.reject(new Error("injected durability failure"))
          : Promise.resolve(outcome!),
    };
    const store = createStore(root, { parentDirectoryDurability: durability });
    const state = initialState();
    const result =
      operation === CloseoutOperation.Create
        ? await store.create(state)
        : await (async () => {
            unwrap(await createStore(root).create(state));
            return store.replace({
              expectedVersion: 0,
              state: persistedState(state, snapshot()),
            });
          })();
    expectResultCommitUnknown(result);
  });
}

function expectResultCommitUnknown(
  result:
    | Awaited<ReturnType<FileCodingTaskSessionCloseoutStore["create"]>>
    | Awaited<ReturnType<FileCodingTaskSessionCloseoutStore["replace"]>>,
): void {
  if (
    result.status !== ResultStatus.Failure ||
    result.error.code !== HarnessErrorCode.CodingTaskSessionCloseoutCommitOutcomeUnknown
  ) {
    throw new Error("测试 fixture 未得到 CommitOutcomeUnknown");
  }
}
