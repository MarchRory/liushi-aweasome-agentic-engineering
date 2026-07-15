import { afterEach, describe, expect, it } from "vitest";

import {
  CompileCodexExecutorCompatibilityUseCase,
  QueryExecutorCompatibilityUseCase,
} from "../../src/application/index.js";
import { createHarnessApplication } from "../../src/bootstrap/index.js";
import { ResultStatus } from "../../src/common/index.js";
import {
  compileExecutorCompatibilityMatrix,
  createManagedFileMutationHookPolicy,
} from "../../src/domain/executorCompatibility/index.js";
import {
  ExclusiveFileLockManager,
  FileExecutorCompatibilityEvidenceStore,
  FileExecutorCompatibilityMatrixStore,
  FileParentDirectoryDurability,
  Rfc8785Sha256DigestAdapter,
} from "../../src/infrastructure/index.js";
import { createCodexCompatibilitySourceFixture } from "../support/executorCompatibility/index.js";
import { TemporaryRuntimeStore } from "../support/runtime/index.js";

const runtimeStores = new TemporaryRuntimeStore();

afterEach(async () => {
  await runtimeStores.cleanup();
});

describe("Executor Compatibility Composition Root", () => {
  it("生产应用从真实来源投影，并跨实例复用同一 Runtime Store", async () => {
    const storeRoot = await runtimeStores.create("liushi-executor-compatibility-bootstrap-");
    const fixture = createCodexCompatibilitySourceFixture();
    const writer = createHarnessApplication({ storeRoot });
    expect(writer.compileCodexExecutorCompatibility).toBeInstanceOf(
      CompileCodexExecutorCompatibilityUseCase,
    );
    expect(writer.queryExecutorCompatibility).toBeInstanceOf(QueryExecutorCompatibilityUseCase);

    const compiled = await writer.compileCodexExecutorCompatibility.execute({
      prepareManifest: fixture.prepareManifest,
      activationPlan: fixture.activationPlan,
      hostResult: fixture.hostResult,
    });
    expect(compiled.status).toBe(ResultStatus.Success);
    if (compiled.status === ResultStatus.Failure) throw compiled.error;

    const reader = createHarnessApplication({ storeRoot });
    const queried = await reader.queryExecutorCompatibility.execute(
      compiled.value.matrix.matrixDigest,
    );

    expect(queried).toEqual({
      status: ResultStatus.Success,
      value: { matrix: compiled.value.matrix, recomputed: true },
    });
  });

  it("生产 Query 恢复并复验两个独立 Codex Artifact 后共同重编译", async () => {
    const storeRoot = await runtimeStores.create("liushi-executor-compatibility-multi-source-");
    const firstFixture = createCodexCompatibilitySourceFixture();
    const secondFixture = createCodexCompatibilitySourceFixture();
    secondFixture.hostResult.verifiedAt = "2026-07-15T08:10:10.000Z";
    const writer = createHarnessApplication({ storeRoot });

    const first = await writer.compileCodexExecutorCompatibility.execute(firstFixture);
    const second = await writer.compileCodexExecutorCompatibility.execute(secondFixture);
    expect(first.status).toBe(ResultStatus.Success);
    expect(second.status).toBe(ResultStatus.Success);
    if (first.status === ResultStatus.Failure) throw first.error;
    if (second.status === ResultStatus.Failure) throw second.error;
    expect(first.value.evidencePersistence.artifactDigest).not.toBe(
      second.value.evidencePersistence.artifactDigest,
    );

    const digest = new Rfc8785Sha256DigestAdapter();
    const storeDependencies = {
      digest,
      lockManager: new ExclusiveFileLockManager(),
      parentDirectoryDurability: new FileParentDirectoryDurability(),
    };
    const evidenceStore = new FileExecutorCompatibilityEvidenceStore(storeRoot, storeDependencies);
    const evidenceDigests = [
      ...first.value.matrix.evidenceDigests,
      ...second.value.matrix.evidenceDigests,
    ];
    const loadedProjections = await evidenceStore.loadProjections(evidenceDigests);
    expect(loadedProjections.status).toBe(ResultStatus.Success);
    if (loadedProjections.status === ResultStatus.Failure) throw loadedProjections.error;
    expect(loadedProjections.value).toHaveLength(2);

    const policy = createManagedFileMutationHookPolicy();
    const combined = compileExecutorCompatibilityMatrix(
      {
        scope: first.value.matrix.scope,
        policy,
        evidence: loadedProjections.value.flatMap((projection) => projection.evidence),
      },
      digest,
    );
    expect(combined.status).toBe(ResultStatus.Success);
    if (combined.status === ResultStatus.Failure) throw combined.error;
    const matrixStore = new FileExecutorCompatibilityMatrixStore(storeRoot, storeDependencies);
    const persisted = await matrixStore.persist({ matrix: combined.value, policy });
    expect(persisted.status).toBe(ResultStatus.Success);
    if (persisted.status === ResultStatus.Failure) throw persisted.error;

    const reader = createHarnessApplication({ storeRoot });
    const queried = await reader.queryExecutorCompatibility.execute(combined.value.matrixDigest);

    expect(queried).toEqual({
      status: ResultStatus.Success,
      value: { matrix: combined.value, recomputed: true },
    });
  });
});
