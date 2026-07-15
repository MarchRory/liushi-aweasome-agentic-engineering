import { stat } from "node:fs/promises";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HarnessErrorCode, ResultStatus } from "../../src/common/index.js";
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
  resolveExecutorCompatibilityMatrixStorePaths,
} from "../../src/infrastructure/index.js";
import { createCodexCompatibilitySourceFixture } from "../support/executorCompatibility/index.js";
import { TemporaryRuntimeStore } from "../support/runtime/index.js";

const writeFileAtomicMock = vi.hoisted(() => vi.fn());

vi.mock("write-file-atomic", () => ({ default: writeFileAtomicMock }));

const runtimeStores = new TemporaryRuntimeStore();
const digest = new Rfc8785Sha256DigestAdapter();

beforeEach(() => {
  writeFileAtomicMock.mockReset();
  writeFileAtomicMock.mockRejectedValue(new Error("injected atomic writer failure"));
});

afterEach(async () => runtimeStores.cleanup());

describe("Executor Compatibility writer failure semantics", () => {
  it("Artifact writer 返回前失败保持 IoFailure，且不发布目标文件", async () => {
    const storeRoot = await runtimeStores.create("liushi-executor-artifact-writer-failure-");
    const fixture = createPersistenceFixture();
    const locator = fixture.projection.evidence[0]?.source.locator.value;
    if (locator === undefined) throw new Error("Codex fixture did not project any evidence.");
    const paths = resolveExecutorCompatibilityArtifactStorePaths(storeRoot, locator);
    const store = new FileExecutorCompatibilityEvidenceStore(storeRoot, createDependencies());

    const result = await store.persist(fixture.projection);

    expect(result).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.IoFailure },
    });
    if (result.status === ResultStatus.Failure) {
      expect(result.error.code).not.toBe(
        HarnessErrorCode.ExecutorCompatibilityCommitOutcomeUnknown,
      );
    }
    expect(writeFileAtomicMock).toHaveBeenCalledTimes(1);
    await expect(stat(paths.recordFile)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(paths.lockFile)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("Matrix writer 返回前失败保持 IoFailure，且不发布目标文件", async () => {
    const storeRoot = await runtimeStores.create("liushi-executor-matrix-writer-failure-");
    const fixture = createPersistenceFixture();
    const paths = resolveExecutorCompatibilityMatrixStorePaths(
      storeRoot,
      fixture.record.matrix.matrixDigest,
    );
    const store = new FileExecutorCompatibilityMatrixStore(storeRoot, createDependencies());

    const result = await store.persist(fixture.record);

    expect(result).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.IoFailure },
    });
    if (result.status === ResultStatus.Failure) {
      expect(result.error.code).not.toBe(
        HarnessErrorCode.ExecutorCompatibilityCommitOutcomeUnknown,
      );
    }
    expect(writeFileAtomicMock).toHaveBeenCalledTimes(1);
    await expect(stat(paths.recordFile)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(paths.lockFile)).rejects.toMatchObject({ code: "ENOENT" });
  });
});

function createPersistenceFixture() {
  const projector = new CodexCompatibilityEvidenceProjectorAdapter(digest);
  const projection = projector.project({
    ...createCodexCompatibilitySourceFixture(),
    artifactLocatorKind: ExecutorEvidenceLocatorKind.RuntimeStore,
  });
  if (projection.status === ResultStatus.Failure) throw projection.error;
  const scope = projection.value.evidence[0]?.scope;
  if (scope === undefined) throw new Error("Codex fixture did not project any evidence.");
  const policy = createManagedFileMutationHookPolicy();
  const matrix = compileExecutorCompatibilityMatrix(
    { scope, policy, evidence: projection.value.evidence },
    digest,
  );
  if (matrix.status === ResultStatus.Failure) throw matrix.error;
  return {
    projection: projection.value,
    record: { matrix: matrix.value, policy },
  };
}

function createDependencies() {
  return {
    lockManager: new ExclusiveFileLockManager(),
    parentDirectoryDurability: new FileParentDirectoryDurability(),
    digest,
  };
}
