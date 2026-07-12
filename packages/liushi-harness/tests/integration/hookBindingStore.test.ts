import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  FileHookBindingStore,
  FileParentDirectoryDurability,
  ExclusiveFileLockManager,
} from "../../src/infrastructure/index.js";
import { HOOK_BINDING_SCHEMA_VERSION, HarnessErrorCode, ResultStatus } from "../../src/index.js";
import { resolveHookBindingStorePaths } from "../../src/infrastructure/persistence/fileHookBindingStore/index.js";
import { TemporaryRuntimeStore } from "../support/runtime/index.js";

const runtimeStores = new TemporaryRuntimeStore();

describe("File Hook Binding Store", () => {
  afterEach(async () => runtimeStores.cleanup());

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
});

function createStore(storeRoot: string): FileHookBindingStore {
  return new FileHookBindingStore(storeRoot, {
    lockManager: new ExclusiveFileLockManager(),
    parentDirectoryDurability: new FileParentDirectoryDurability(),
  });
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
    planRiskArtifactDigest: `sha256:${planRiskArtifactId.padEnd(64, "0")}`,
    actorId,
    boundAt: "2026-07-12T08:00:00.000Z",
  };
}
