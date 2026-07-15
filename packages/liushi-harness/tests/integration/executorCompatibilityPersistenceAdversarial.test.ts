import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { lstat, mkdir, readFile, readdir, rm, stat, symlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  ExecutorCompatibilityWriteDisposition,
  type ExecutorCompatibilityEvidenceProjection,
  type ExecutorCompatibilityMatrixRecord,
} from "../../src/application/ports/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  type ContentDigest,
} from "../../src/common/index.js";
import {
  ExecutorEvidenceLocatorKind,
  compileExecutorCompatibilityMatrix,
  createManagedFileMutationHookPolicy,
} from "../../src/domain/executorCompatibility/index.js";
import {
  CodexCompatibilityEvidenceProjectorAdapter,
  ExclusiveFileLockManager,
  FileExecutorCompatibilityEvidenceStore,
  FileExecutorCompatibilityMatrixStore,
  FileParentDirectoryDurability,
  Rfc8785Sha256DigestAdapter,
  resolveExecutorCompatibilityArtifactStorePaths,
  resolveExecutorCompatibilityEvidenceStorePaths,
  resolveExecutorCompatibilityMatrixStorePaths,
  type ExclusiveFileLockHandle,
  type FileLockManager,
  type TaskLockContext,
} from "../../src/infrastructure/index.js";
import { createCodexCompatibilitySourceFixture } from "../support/executorCompatibility/index.js";
import { TemporaryRuntimeStore } from "../support/runtime/index.js";

const GOLDEN_ARTIFACT_DIGEST =
  "sha256:b969388e7ca1116c8691a45b3a87ad24a8d43d86f2988702e18272691b5f515c" as ContentDigest;
const GOLDEN_EVIDENCE_DIGESTS = [
  "sha256:1de75e447cd4bf5b7a628d9a34de16e9a955a07d723649d0de87ec3a3c5eada7" as ContentDigest,
  "sha256:43c3a815b376392802f50127379258f0554b70ef91a43ef7a237091d0378e581" as ContentDigest,
  "sha256:859f14149810dce1cedd96b5c9bb70c73dce5e00c294fc5bbba56722fdd00a41" as ContentDigest,
  "sha256:ef8a45c2b938329273505034fe853458b3208c69b1929f42afdecee8e09a9620" as ContentDigest,
  "sha256:695fed82022a3b9bd2f572ebde30c4429946b1de11574fbc3cf0e3381ed8d356" as ContentDigest,
  "sha256:bb3fb8233df3fedf6ee05b73d4e52e8bb409ed79f1c069afd0c48cfdc4fd6aca" as ContentDigest,
  "sha256:689b077092f2ea382461a800457e6e41acc84ae6a27275dd180ca8a28e2c06b3" as ContentDigest,
] as const;
const GOLDEN_PERSISTED_EVIDENCE_DIGESTS = [
  "sha256:1de75e447cd4bf5b7a628d9a34de16e9a955a07d723649d0de87ec3a3c5eada7" as ContentDigest,
  "sha256:43c3a815b376392802f50127379258f0554b70ef91a43ef7a237091d0378e581" as ContentDigest,
  "sha256:689b077092f2ea382461a800457e6e41acc84ae6a27275dd180ca8a28e2c06b3" as ContentDigest,
  "sha256:695fed82022a3b9bd2f572ebde30c4429946b1de11574fbc3cf0e3381ed8d356" as ContentDigest,
  "sha256:859f14149810dce1cedd96b5c9bb70c73dce5e00c294fc5bbba56722fdd00a41" as ContentDigest,
  "sha256:bb3fb8233df3fedf6ee05b73d4e52e8bb409ed79f1c069afd0c48cfdc4fd6aca" as ContentDigest,
  "sha256:ef8a45c2b938329273505034fe853458b3208c69b1929f42afdecee8e09a9620" as ContentDigest,
] as const;
const GOLDEN_MATRIX_DIGEST =
  "sha256:257d86cd214ebde75c7b5604322ba89dfd183859a86b23606a562f133fcccf9c" as ContentDigest;
const GOLDEN_RUNTIME_STORE_LOCATOR =
  "executorCompatibility/codex/b969388e7ca1116c8691a45b3a87ad24a8d43d86f2988702e18272691b5f515c.json";
const CHILD_SIGNAL_WATCHDOG_MS = 5_000;
const runtimeStores = new TemporaryRuntimeStore();
const digest = new Rfc8785Sha256DigestAdapter();

const CHILD_LOCK_HOLDER_SCRIPT = String.raw`
import { open, rm } from "node:fs/promises";

const lockFile = process.argv[1];
if (lockFile === undefined) throw new Error("Lock file argument is required.");

const lockHandle = await open(lockFile, "wx");
await lockHandle.writeFile('{"holder":"independent-node-process"}\n', "utf8");
await lockHandle.sync();
let released = false;
async function releaseLock() {
  if (released) return;
  released = true;
  await lockHandle.close();
  await rm(lockFile, { force: true });
}

try {
  process.stdout.write("ready\n");
  let command = "";
  for await (const chunk of process.stdin) {
    command += chunk.toString();
    if (command.includes("\n")) break;
  }
  if (command.trim() !== "release") throw new Error("Expected release command.");
  await releaseLock();
  process.stdout.write("released\n");
} finally {
  await releaseLock();
}
`;

afterEach(async () => runtimeStores.cleanup());

describe("Executor Compatibility persistence adversarial QA", () => {
  it("将真实 Codex fixture 固定为独立 golden 摘要与 RuntimeStore locator", () => {
    const fixture = createRealCodexPersistenceFixture();

    expect(fixture.projection.artifactDigest).toBe(GOLDEN_ARTIFACT_DIGEST);
    expect(fixture.projection.evidence.map((item) => item.evidenceDigest)).toEqual(
      GOLDEN_EVIDENCE_DIGESTS,
    );
    expect(fixture.projection.evidence).toHaveLength(7);
    expect(
      fixture.projection.evidence.every(
        (item) =>
          item.source.locator.kind === ExecutorEvidenceLocatorKind.RuntimeStore &&
          item.source.locator.value === GOLDEN_RUNTIME_STORE_LOCATOR,
      ),
    ).toBe(true);
    expect(fixture.record.matrix.matrixDigest).toBe(GOLDEN_MATRIX_DIGEST);
  });

  it("Artifact 成为安全孤儿后 Evidence 写前锁失败仍保留 LockUnavailable，真实 Store 重试可查询", async () => {
    const storeRoot = await runtimeStores.create("liushi-executor-orphan-lock-");
    const fixture = createRealCodexPersistenceFixture();
    const lockManager = new FailSecondAcquireLockManager();
    const artifactPaths = resolveExecutorCompatibilityArtifactStorePaths(
      storeRoot,
      GOLDEN_RUNTIME_STORE_LOCATOR,
    );
    const firstEvidencePaths = resolveExecutorCompatibilityEvidenceStorePaths(
      storeRoot,
      GOLDEN_EVIDENCE_DIGESTS[0],
    );

    const interrupted = await createEvidenceStore(storeRoot, lockManager).persist(
      fixture.projection,
    );

    expect(interrupted.status).toBe(ResultStatus.Failure);
    if (interrupted.status === ResultStatus.Failure) {
      expect(interrupted.error.code).toBe(HarnessErrorCode.LockUnavailable);
      expect(interrupted.error.code).not.toBe(
        HarnessErrorCode.ExecutorCompatibilityCommitOutcomeUnknown,
      );
    }
    expect(lockManager.acquireAttempts).toEqual([
      artifactPaths.lockFile,
      firstEvidencePaths.lockFile,
    ]);
    expect(JSON.parse(await readFile(artifactPaths.recordFile, "utf8"))).toEqual(
      fixture.projection.artifact,
    );
    expect(await listJsonFiles(dirname(firstEvidencePaths.recordFile))).toEqual([]);
    await expect(stat(artifactPaths.lockFile)).rejects.toMatchObject({ code: "ENOENT" });

    const retried = await createEvidenceStore(storeRoot).persist(fixture.projection);
    expect(retried).toEqual({
      status: ResultStatus.Success,
      value: {
        disposition: ExecutorCompatibilityWriteDisposition.Persisted,
        artifactDigest: GOLDEN_ARTIFACT_DIGEST,
        evidenceDigests: GOLDEN_PERSISTED_EVIDENCE_DIGESTS,
      },
    });
    expect(await createEvidenceStore(storeRoot).loadProjection(GOLDEN_EVIDENCE_DIGESTS)).toEqual({
      status: ResultStatus.Success,
      value: fixture.projection,
    });
    expect(await listJsonFiles(dirname(firstEvidencePaths.recordFile))).toHaveLength(7);
  }, 10_000);

  it("真实目录 junction 或 symlink 对写入关闭为 OperationForbidden、对读取关闭为 CorruptStore", async () => {
    const storeRoot = await runtimeStores.create("liushi-executor-link-store-");
    const externalRoot = await runtimeStores.create("liushi-executor-link-external-");
    const linkPath = join(storeRoot, "executorCompatibility");
    const fixture = createRealCodexPersistenceFixture();
    await symlink(externalRoot, linkPath, process.platform === "win32" ? "junction" : "dir");

    try {
      const evidenceWrite = await createEvidenceStore(storeRoot).persist(fixture.projection);
      const matrixWrite = await createMatrixStore(storeRoot).persist(fixture.record);
      expect(evidenceWrite).toMatchObject({
        status: ResultStatus.Failure,
        error: { code: HarnessErrorCode.OperationForbidden },
      });
      expect(matrixWrite).toMatchObject({
        status: ResultStatus.Failure,
        error: { code: HarnessErrorCode.OperationForbidden },
      });
      expect(await readdir(externalRoot)).toEqual([]);

      expect(await createEvidenceStore(storeRoot).load(GOLDEN_EVIDENCE_DIGESTS[0])).toMatchObject({
        status: ResultStatus.Failure,
        error: { code: HarnessErrorCode.CorruptStore },
      });
      expect(await createMatrixStore(storeRoot).load(GOLDEN_MATRIX_DIGEST)).toMatchObject({
        status: ResultStatus.Failure,
        error: { code: HarnessErrorCode.CorruptStore },
      });
      expect(await readdir(externalRoot)).toEqual([]);
    } finally {
      await removeDirectoryLinkSafely(linkPath);
    }
  }, 10_000);

  it("独立 Node 进程持有精确 Matrix lock 时返回 LockUnavailable，释放后唯一 JSON 完整可查", async () => {
    const storeRoot = await runtimeStores.create("liushi-executor-child-lock-");
    const fixture = createRealCodexPersistenceFixture();
    const paths = resolveExecutorCompatibilityMatrixStorePaths(storeRoot, GOLDEN_MATRIX_DIGEST);
    await mkdir(dirname(paths.lockFile), { recursive: true });
    const child = spawn(
      process.execPath,
      ["--input-type=module", "--eval", CHILD_LOCK_HOLDER_SCRIPT, paths.lockFile],
      { stdio: ["pipe", "pipe", "pipe"], windowsHide: true },
    );
    const childStderr: string[] = [];
    child.stderr.on("data", (chunk: Buffer) => childStderr.push(chunk.toString("utf8")));
    child.stdin.on("error", () => undefined);

    try {
      await waitForChildSignal(child, "ready", childStderr);
      await expect(stat(paths.lockFile).then((value) => value.isFile())).resolves.toBe(true);

      const blocked = await createMatrixStore(storeRoot).persist(fixture.record);
      expect(blocked).toMatchObject({
        status: ResultStatus.Failure,
        error: { code: HarnessErrorCode.LockUnavailable },
      });
      await expect(stat(paths.recordFile)).rejects.toMatchObject({ code: "ENOENT" });

      const releasedSignal = waitForChildSignal(child, "released", childStderr);
      const childExit = waitForChildExit(child);
      child.stdin.end("release\n");
      await releasedSignal;
      await expect(childExit).resolves.toEqual({ code: 0, signal: null });
      await expect(stat(paths.lockFile)).rejects.toMatchObject({ code: "ENOENT" });

      const retried = await createMatrixStore(storeRoot).persist(fixture.record);
      expect(retried).toEqual({
        status: ResultStatus.Success,
        value: {
          disposition: ExecutorCompatibilityWriteDisposition.Persisted,
          matrixDigest: GOLDEN_MATRIX_DIGEST,
        },
      });
      expect(await createMatrixStore(storeRoot).load(GOLDEN_MATRIX_DIGEST)).toEqual({
        status: ResultStatus.Success,
        value: fixture.record,
      });
      expect(JSON.parse(await readFile(paths.recordFile, "utf8"))).toEqual(fixture.record);
      expect(await listJsonFiles(dirname(paths.recordFile))).toEqual([basename(paths.recordFile)]);
      await expect(stat(paths.lockFile)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await ensureLockHolderStopped(child, paths.lockFile);
    }
  }, 15_000);
});

/** 真实 Codex 来源经生产 Projector 与 Domain Compiler 形成的持久化输入。 */
interface RealCodexPersistenceFixture {
  readonly projection: ExecutorCompatibilityEvidenceProjection;
  readonly record: ExecutorCompatibilityMatrixRecord;
}

function createRealCodexPersistenceFixture(): RealCodexPersistenceFixture {
  const projector = new CodexCompatibilityEvidenceProjectorAdapter(digest);
  const projected = projector.project({
    ...createCodexCompatibilitySourceFixture(),
    artifactLocatorKind: ExecutorEvidenceLocatorKind.RuntimeStore,
  });
  if (projected.status === ResultStatus.Failure) throw projected.error;
  const scope = projected.value.evidence[0]?.scope;
  if (scope === undefined) throw new Error("Codex fixture did not project any evidence.");
  const policy = createManagedFileMutationHookPolicy();
  const compiled = compileExecutorCompatibilityMatrix(
    { scope, policy, evidence: projected.value.evidence },
    digest,
  );
  if (compiled.status === ResultStatus.Failure) throw compiled.error;
  return {
    projection: projected.value,
    record: { matrix: compiled.value, policy },
  };
}

function createEvidenceStore(
  storeRoot: string,
  lockManager: FileLockManager = new ExclusiveFileLockManager(),
): FileExecutorCompatibilityEvidenceStore {
  return new FileExecutorCompatibilityEvidenceStore(storeRoot, {
    lockManager,
    parentDirectoryDurability: new FileParentDirectoryDurability(),
    digest,
  });
}

function createMatrixStore(storeRoot: string): FileExecutorCompatibilityMatrixStore {
  return new FileExecutorCompatibilityMatrixStore(storeRoot, {
    lockManager: new ExclusiveFileLockManager(),
    parentDirectoryDurability: new FileParentDirectoryDurability(),
    digest,
  });
}

class FailSecondAcquireLockManager implements FileLockManager {
  readonly acquireAttempts: string[] = [];
  readonly #delegate = new ExclusiveFileLockManager();

  public async acquire(
    lockFile: string,
    context: TaskLockContext,
  ): Promise<ExclusiveFileLockHandle> {
    this.acquireAttempts.push(lockFile);
    if (this.acquireAttempts.length === 2) {
      throw new HarnessError(
        HarnessErrorCode.LockUnavailable,
        "injected Evidence lock acquisition failure",
      );
    }
    return this.#delegate.acquire(lockFile, context);
  }
}

async function listJsonFiles(directory: string): Promise<string[]> {
  try {
    return (await readdir(directory)).filter((entry) => entry.endsWith(".json")).sort();
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return [];
    throw error;
  }
}

async function removeDirectoryLinkSafely(linkPath: string): Promise<void> {
  try {
    const linkStat = await lstat(linkPath);
    if (!linkStat.isSymbolicLink()) {
      throw new Error(`Refusing to recursively remove non-link path: ${linkPath}`);
    }
    await rm(linkPath, { recursive: true, force: true });
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return;
    throw error;
  }
}

function waitForChildSignal(
  child: ChildProcessWithoutNullStreams,
  expectedSignal: string,
  stderr: readonly string[],
): Promise<void> {
  return new Promise((resolveSignal, rejectSignal) => {
    let stdout = "";
    const watchdog = AbortSignal.timeout(CHILD_SIGNAL_WATCHDOG_MS);
    const onData = (chunk: Buffer): void => {
      stdout += chunk.toString("utf8");
      if (stdout.split(/\r?\n/u).includes(expectedSignal)) {
        cleanupListeners();
        resolveSignal();
      }
    };
    const onError = (error: Error): void => {
      cleanupListeners();
      rejectSignal(error);
    };
    const onClose = (code: number | null, signal: NodeJS.Signals | null): void => {
      cleanupListeners();
      rejectSignal(
        new Error(
          `Lock holder closed before '${expectedSignal}' (code=${String(code)}, signal=${String(signal)}): ${stderr.join("")}`,
        ),
      );
    };
    const onAbort = (): void => {
      cleanupListeners();
      rejectSignal(new Error(`Timed out waiting for lock holder signal '${expectedSignal}'.`));
    };
    const cleanupListeners = (): void => {
      child.stdout.off("data", onData);
      child.off("error", onError);
      child.off("close", onClose);
      watchdog.removeEventListener("abort", onAbort);
    };

    child.stdout.on("data", onData);
    child.once("error", onError);
    child.once("close", onClose);
    watchdog.addEventListener("abort", onAbort, { once: true });
  });
}

function waitForChildExit(
  child: ChildProcessWithoutNullStreams,
): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({ code: child.exitCode, signal: child.signalCode });
  }
  return new Promise((resolveExit, rejectExit) => {
    const watchdog = AbortSignal.timeout(CHILD_SIGNAL_WATCHDOG_MS);
    const onError = (error: Error): void => {
      cleanupListeners();
      rejectExit(error);
    };
    const onExit = (code: number | null, signal: NodeJS.Signals | null): void => {
      cleanupListeners();
      resolveExit({ code, signal });
    };
    const onAbort = (): void => {
      cleanupListeners();
      rejectExit(new Error("Timed out waiting for lock holder exit."));
    };
    const cleanupListeners = (): void => {
      child.off("error", onError);
      child.off("exit", onExit);
      watchdog.removeEventListener("abort", onAbort);
    };

    child.once("error", onError);
    child.once("exit", onExit);
    watchdog.addEventListener("abort", onAbort, { once: true });
  });
}

async function ensureLockHolderStopped(
  child: ChildProcessWithoutNullStreams,
  childLockFile: string,
): Promise<void> {
  if (child.exitCode === null && child.signalCode === null) {
    const childExit = waitForChildExit(child);
    child.kill();
    await childExit;
  }
  await rm(childLockFile, { force: true });
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
