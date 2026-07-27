import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  CodingTaskSessionCloseoutRecoveryResolution,
  markCodingTaskSessionCloseoutRecoveryExecuting,
  type CodingTaskSessionCloseoutRecoveryState,
} from "../../../src/application/codingTaskSessionCloseoutRecovery/index.js";
import { ParentDirectorySyncStatus } from "../../../src/application/ports/index.js";
import {
  ExclusiveFileLockManager,
  FileParentDirectoryDurability,
} from "../../../src/infrastructure/index.js";
import { FileCodingTaskSessionCloseoutRecoveryStore } from "../../../src/infrastructure/persistence/fileCodingTaskSessionCloseoutRecoveryStore/index.js";
import type { FileCodingTaskSessionCloseoutRecoveryStoreDependencies } from "../../../src/infrastructure/persistence/fileCodingTaskSessionCloseoutRecoveryStore/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  type Result,
} from "../../../src/common/index.js";
import type {
  ExclusiveFileLockHandle,
  FileLockManager,
  ParentDirectorySyncOutcome,
} from "../../../src/infrastructure/persistence/fileEventStore/index.js";
import { approvedRecoveryState, unwrap } from "./codingTaskSessionCloseoutRecoveryStateFixture.js";
import { digest, session, workspace } from "../codingTaskSessionCloseout/index.js";

/** Recovery Store 测试使用的固定定位信息。 */
export const recoveryLocator = { workspaceId: workspace, sessionId: session } as const;

/** 计算 Recovery State 的精确文件路径。 */
export function recoveryStateFile(root: string, target = recoveryLocator): string {
  return join(
    root,
    "workspaces",
    target.workspaceId,
    "codingTaskSessions",
    target.sessionId,
    "closeoutRecovery.json",
  );
}

/** 计算 Recovery Store 的独立锁路径。 */
export function recoveryLockFile(root: string, target = recoveryLocator): string {
  return join(
    root,
    "workspaces",
    target.workspaceId,
    "codingTaskSessions",
    target.sessionId,
    ".closeoutRecovery.lock",
  );
}

/** 计算邻接原 Closeout 文件路径，用于证明 Recovery Store 不触碰它。 */
export function closeoutStateFile(root: string, target = recoveryLocator): string {
  return join(
    root,
    "workspaces",
    target.workspaceId,
    "codingTaskSessions",
    target.sessionId,
    "closeout.json",
  );
}

/** 创建使用真实基础设施依赖的 File Recovery Store。 */
export function createStore(
  storeRoot: string,
  overrides: Partial<FileCodingTaskSessionCloseoutRecoveryStoreDependencies> = {},
): FileCodingTaskSessionCloseoutRecoveryStore {
  return new FileCodingTaskSessionCloseoutRecoveryStore(storeRoot, {
    digest,
    lockManager: new ExclusiveFileLockManager(),
    parentDirectoryDurability: new FileParentDirectoryDurability(),
    ...overrides,
  });
}

/** 创建临时 Store Root 并在测试结束后清理。 */
export async function withTempRoot<T>(callback: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "liushi-closeout-recovery-"));
  try {
    return await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

/** 创建固定的 Recovery State 初始记录。 */
export function initialRecoveryState(): CodingTaskSessionCloseoutRecoveryState {
  return approvedRecoveryState(CodingTaskSessionCloseoutRecoveryResolution.RetryOnce);
}

/** 生成 RetryOnce 的 Executing successor。 */
export function executingRecoveryState(
  state: CodingTaskSessionCloseoutRecoveryState = initialRecoveryState(),
): CodingTaskSessionCloseoutRecoveryState {
  return unwrap(
    markCodingTaskSessionCloseoutRecoveryExecuting(
      state,
      { updatedAt: "2026-07-27T00:00:01.000Z" },
      digest,
    ),
  );
}

/** 写入一个邻接 Closeout 文件并返回其原始字节。 */
export async function writeAdjacentCloseout(
  root: string,
  bytes = "original-closeout-bytes\r\n",
): Promise<string> {
  const file = closeoutStateFile(root);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, bytes, "utf8");
  return bytes;
}

/** 读取测试文件的原始 UTF-8 字节。 */
export function readText(file: string): Promise<string> {
  return readFile(file, "utf8");
}

/** 注入固定的父目录耐久化结果。 */
export class FixedParentDirectoryDurability {
  public constructor(private readonly outcome: ParentDirectorySyncOutcome) {}

  public syncParentDirectory(): Promise<ParentDirectorySyncOutcome> {
    return Promise.resolve(this.outcome);
  }
}

/** 注入一次锁竞争，不进行隐式重试。 */
export class RejectingLockManager implements FileLockManager {
  public calls = 0;

  public acquire(): Promise<ExclusiveFileLockHandle> {
    this.calls += 1;
    return Promise.reject(new HarnessError(HarnessErrorCode.LockUnavailable, "injected busy lock"));
  }
}

/** 注入锁释放未知结果。 */
export class ReleaseFailureLockManager implements FileLockManager {
  public acquire(): Promise<ExclusiveFileLockHandle> {
    return Promise.resolve({
      release: () => Promise.reject(new Error("injected release failure")),
    });
  }
}

/** 将两个 mutation 确定性排队，便于验证一个成功、一个 VersionConflict。 */
export class QueuedLockManager implements FileLockManager {
  private tail = Promise.resolve();

  public acquire(): Promise<ExclusiveFileLockHandle> {
    let releaseTurn!: () => void;
    const turn = new Promise<void>((resolveTurn) => {
      releaseTurn = resolveTurn;
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

/** 在测试中检查 Result 并返回成功值。 */
export function unwrapResult<T>(result: Result<T, HarnessError>): T {
  if (result.status === ResultStatus.Failure) throw result.error;
  return result.value;
}

/** 返回用于父目录耐久化注入的稳定失败状态。 */
export function bestEffortOutcome(): ParentDirectorySyncOutcome {
  return { status: ParentDirectorySyncStatus.BestEffort, reason: "injected-best-effort" };
}
