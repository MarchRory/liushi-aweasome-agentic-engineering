import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  FileHookBindingStore,
  FileParentDirectoryDurability,
  ExclusiveFileLockManager,
  Rfc8785Sha256DigestAdapter,
  normalizePathIdentity,
  readHookBindingFile,
  type ExclusiveFileLockHandle,
  type FileLockManager,
  type ParentDirectoryDurability,
} from "../../src/infrastructure/index.js";
import {
  createSessionHookBinding,
  HOOK_BINDING_SCHEMA_VERSION,
  HarnessErrorCode,
  rebuildSessionHookBinding,
  ResultStatus,
  ParentDirectorySyncStatus,
  SESSION_HOOK_BINDING_SCHEMA_VERSION,
  type SessionHookBinding,
} from "../../src/index.js";
import { resolveHookBindingStorePaths } from "../../src/infrastructure/persistence/fileHookBindingStore/index.js";
import { TemporaryRuntimeStore } from "../support/runtime/index.js";

const runtimeStores = new TemporaryRuntimeStore();

describe("File Hook Binding Store", () => {
  afterEach(() => runtimeStores.cleanup());

  it("支持同一绑定幂等、不同身份冲突以及最长祖先匹配", async () => {
    const storeRoot = await runtimeStores.create("liushi-hook-binding-");
    const store = createStore(storeRoot);
    const repositoryRoot = join(storeRoot, "repository");
    const nestedRoot = join(repositoryRoot, "packages", "app");
    const first = binding(repositoryRoot, "task-a", "artifact-a", "actor-a");
    const nested = binding(nestedRoot, "task-b", "artifact-b", "actor-b");

    const recorded = await store.bind(first);
    const reused = await store.bind({ ...first, boundAt: "2026-07-12T09:00:00.000Z" });
    const conflict = await store.bind({ ...first, taskId: "task-other" });
    const nestedRecorded = await store.bind(nested);
    const foundNested = await store.find(join(nestedRoot, "src"));
    const foundRepository = await store.find(join(repositoryRoot, "README.md"));
    const outside = await store.find(join(storeRoot, "outside"));

    expect(recorded).toMatchObject({ status: ResultStatus.Success, value: first });
    expect(reused).toMatchObject({ status: ResultStatus.Success, value: first });
    expect(conflict).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.VersionConflict },
    });
    expect(nestedRecorded.status).toBe(ResultStatus.Success);
    expect(foundNested).toMatchObject({ status: ResultStatus.Success, value: nested });
    expect(foundRepository).toMatchObject({ status: ResultStatus.Success, value: first });
    expect(outside).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.OperationForbidden },
    });

    const file = JSON.parse(await readFile(pathsFor(storeRoot).recordFile, "utf8")) as {
      schemaVersion: string;
    };
    expect(file.schemaVersion).toBe("2.0.0");
  });

  it("读取旧 v1 文件并确定性升级写入文件 Schema", async () => {
    const storeRoot = await runtimeStores.create("liushi-hook-binding-v1-");
    const paths = pathsFor(storeRoot);
    const store = createStore(storeRoot);
    const legacy = binding(join(storeRoot, "repository"), "task-a", "artifact-a", "actor-a");
    await store.bind(legacy);
    await writeFile(
      paths.recordFile,
      `${JSON.stringify({ schemaVersion: "1.0.0", bindings: [legacy] })}\n`,
      "utf8",
    );

    const found = await store.find(join(storeRoot, "repository", "src"));
    expect(found).toMatchObject({ status: ResultStatus.Success, value: legacy });
    await store.bind({ ...legacy, boundAt: "2026-07-12T09:00:00.000Z" });
    const upgraded = JSON.parse(await readFile(paths.recordFile, "utf8")) as {
      schemaVersion: string;
    };
    expect(upgraded.schemaVersion).toBe("2.0.0");
  });

  it("Binding 集合按目标平台区分路径大小写语义", async () => {
    const storeRoot = await runtimeStores.create("liushi-hook-binding-path-identity-");
    const paths = pathsFor(storeRoot);
    const recordFile = paths.recordFile;
    const upperRoot = join(storeRoot, "Repository");
    const lowerRoot = join(storeRoot, "repository");
    const bindings = [
      binding(upperRoot, "task-a", "artifact-a", "actor-a"),
      binding(lowerRoot, "task-a", "artifact-a", "actor-a"),
    ];
    await mkdir(paths.directory, { recursive: true });
    await writeFile(
      recordFile,
      `${JSON.stringify({ schemaVersion: "1.0.0", bindings })}\n`,
      "utf8",
    );

    const posix = await readHookBindingFile(recordFile, undefined, (value) =>
      normalizePathIdentity(value, "linux"),
    );
    const windows = await readHookBindingFile(recordFile, undefined, (value) =>
      normalizePathIdentity(value, "win32"),
    );

    expect(posix).toMatchObject({
      status: ResultStatus.Success,
      value: [{ workspaceRoot: upperRoot }, { workspaceRoot: lowerRoot }],
    });
    expect(windows).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.CorruptStore },
    });
  });

  it("计算并校验 v2 Session Binding Digest", () => {
    const digest = new Rfc8785Sha256DigestAdapter();
    const created = createSessionHookBinding(
      sessionInput(join("C:\\workspace", "repository")),
      digest,
    );
    expect(created.status).toBe(ResultStatus.Success);
    if (created.status === ResultStatus.Failure) return;
    const rebuilt = rebuildSessionHookBinding(
      { ...created.value, sessionBindingDigest: `sha256:${"f".repeat(64)}` },
      digest,
    );
    expect(rebuilt).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.PreconditionNotMet },
    });
    expect(created.value.sessionBindingDigest).not.toBe(`sha256:${"f".repeat(64)}`);
  });

  it("同 root v2 优先，公共身份冲突且不回退", async () => {
    const storeRoot = await runtimeStores.create("liushi-hook-binding-v2-priority-");
    const store = createStore(storeRoot);
    const root = join(storeRoot, "repository");
    const legacy = binding(root, "task-a", "artifact-a", "actor-a");
    const session = sessionBinding(root, "session-a", "task-a");
    expect((await store.bind(legacy)).status).toBe(ResultStatus.Success);
    expect((await store.bind(session)).status).toBe(ResultStatus.Success);

    const found = await store.find(join(root, "src"));
    expect(found).toMatchObject({
      status: ResultStatus.Success,
      value: { schemaVersion: SESSION_HOOK_BINDING_SCHEMA_VERSION, sessionId: "session-a" },
    });
    const conflict = await store.bind(sessionBinding(root, "session-a", "task-other"));
    expect(conflict).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.VersionConflict },
    });
  });

  it("findSession 只精确读取 v2", async () => {
    const storeRoot = await runtimeStores.create("liushi-hook-binding-session-");
    const store = createStore(storeRoot);
    const root = join(storeRoot, "repository");
    await store.bind(binding(root, "task-a", "artifact-a", "actor-a"));
    const absent = await store.findSession({ workspaceId: "workspace-hook", sessionId: "missing" });
    expect(absent).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.OperationForbidden },
    });
    const session = sessionBinding(root, "session-a", "task-a");
    await store.bind(session);
    expect(
      await store.findSession({ workspaceId: "workspace-hook", sessionId: "session-a" }),
    ).toMatchObject({
      status: ResultStatus.Success,
      value: session,
    });
  });

  it("拒绝损坏的 v2 摘要", async () => {
    const storeRoot = await runtimeStores.create("liushi-hook-binding-v2-corrupt-");
    const paths = pathsFor(storeRoot);
    const store = createStore(storeRoot);
    const session = sessionBinding(join(storeRoot, "repository"), "session-a", "task-a");
    await store.bind(session);
    const file = JSON.parse(await readFile(paths.recordFile, "utf8")) as {
      bindings: SessionHookBinding[];
    };
    const first = file.bindings[0];
    if (first === undefined) throw new Error("测试文件缺少 v2 Binding。");
    file.bindings[0] = { ...first, sessionBindingDigest: `sha256:${"0".repeat(64)}` };
    await writeFile(paths.recordFile, JSON.stringify(file), "utf8");

    const result = await store.findSession({
      workspaceId: "workspace-hook",
      sessionId: "session-a",
    });
    expect(result).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.CorruptStore },
    });
  });

  it("对损坏的绑定文件 fail closed", async () => {
    const storeRoot = await runtimeStores.create("liushi-hook-binding-corrupt-");
    const paths = resolveHookBindingStorePaths(storeRoot);
    const store = createStore(storeRoot);
    await store.bind(binding(join(storeRoot, "repository"), "task-a", "artifact-a", "actor-a"));
    await writeFile(paths.recordFile, "{not-json", "utf8");

    const result = await store.find(storeRoot);

    expect(result).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.CorruptStore },
    });
  });

  it("BestEffort 父目录状态不得把 Session Binding 报告为健康", async () => {
    const storeRoot = await runtimeStores.create("liushi-hook-binding-durability-");
    const durability: ParentDirectoryDurability = {
      syncParentDirectory: () =>
        Promise.resolve({
          status: ParentDirectorySyncStatus.BestEffort,
          reason: "injected-best-effort",
        }),
    };
    const store = new FileHookBindingStore(storeRoot, {
      lockManager: new ExclusiveFileLockManager(),
      parentDirectoryDurability: durability,
      digest: new Rfc8785Sha256DigestAdapter(),
    });

    const result = await store.bind(
      sessionBinding(join(storeRoot, "repository"), "session-a", "task-a"),
    );

    expect(result).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.HookBindingCommitOutcomeUnknown },
    });
  });

  it("Binding Lock 释放失败时返回稳定未知结果", async () => {
    const storeRoot = await runtimeStores.create("liushi-hook-binding-lock-");
    const store = new FileHookBindingStore(storeRoot, {
      lockManager: new ReleaseFailingLockManager(),
      parentDirectoryDurability: new FileParentDirectoryDurability(),
      digest: new Rfc8785Sha256DigestAdapter(),
    });

    const result = await store.bind(
      sessionBinding(join(storeRoot, "repository"), "session-a", "task-a"),
    );

    expect(result).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.HookBindingLockReleaseUnknown },
    });
  });
});

/** 仅用于证明 Binding Store 不得吞掉 Lock release 失败。 */
class ReleaseFailingLockManager implements FileLockManager {
  public acquire(): Promise<ExclusiveFileLockHandle> {
    return Promise.resolve({
      release: () => Promise.reject(new Error("injected release failure")),
    });
  }
}

function createStore(storeRoot: string): FileHookBindingStore {
  return new FileHookBindingStore(storeRoot, {
    lockManager: new ExclusiveFileLockManager(),
    parentDirectoryDurability: new FileParentDirectoryDurability(),
    digest: new Rfc8785Sha256DigestAdapter(),
  });
}

function pathsFor(storeRoot: string) {
  return resolveHookBindingStorePaths(storeRoot);
}

function sessionBinding(root: string, sessionId: string, taskId: string): SessionHookBinding {
  const result = createSessionHookBinding(
    sessionInput(root, sessionId, taskId),
    new Rfc8785Sha256DigestAdapter(),
  );
  if (result.status === ResultStatus.Failure) throw result.error;
  return result.value;
}

function sessionInput(
  workspaceRoot: string,
  sessionId = "session-a",
  taskId = "task-a",
): Omit<SessionHookBinding, "sessionBindingDigest"> {
  return {
    schemaVersion: SESSION_HOOK_BINDING_SCHEMA_VERSION,
    workspaceRoot,
    workspaceId: "workspace-hook",
    taskId,
    planRiskArtifactId: "artifact-a",
    planRiskArtifactDigest: `sha256:${"a".repeat(64)}`,
    actorId: "actor-a",
    boundAt: "2026-07-12T08:00:00.000Z",
    sessionId,
    codingTaskId: "coding-task-a",
    attemptNumber: 1,
    worktreeId: "worktree-a",
    worktreeRootDigest: `sha256:${"b".repeat(64)}`,
    activationBindingDigest: `sha256:${"c".repeat(64)}`,
  };
}

function binding(
  workspaceRoot: string,
  taskId: string,
  planRiskArtifactId: string,
  actorId: string,
): {
  schemaVersion: typeof HOOK_BINDING_SCHEMA_VERSION;
  workspaceRoot: string;
  workspaceId: string;
  taskId: string;
  planRiskArtifactId: string;
  planRiskArtifactDigest: string;
  actorId: string;
  boundAt: string;
} {
  return {
    schemaVersion: HOOK_BINDING_SCHEMA_VERSION,
    workspaceRoot,
    workspaceId: "workspace-hook",
    taskId,
    planRiskArtifactId,
    planRiskArtifactDigest: `sha256:${"a".repeat(64)}`,
    actorId,
    boundAt: "2026-07-12T08:00:00.000Z",
  };
}
