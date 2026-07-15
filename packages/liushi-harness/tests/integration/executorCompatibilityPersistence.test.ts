import { readFile, rm, writeFile } from "node:fs/promises";

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
  type Result,
} from "../../src/common/index.js";
import {
  EXECUTOR_CAPABILITY_EVIDENCE_SCHEMA_VERSION,
  ExecutorAdapterKind,
  ExecutorArchitecture,
  ExecutorCapability,
  ExecutorCapabilityQualifierKind,
  ExecutorDistribution,
  ExecutorEvidenceKind,
  ExecutorEvidenceLocatorKind,
  ExecutorEvidenceOutcome,
  ExecutorHostSurface,
  ExecutorOperatingSystem,
  compileExecutorCompatibilityMatrix,
  createExecutorCapabilityEvidenceDigestInput,
  createManagedFileMutationHookPolicy,
  type ExecutorCapabilityEvidence,
  type ExecutorHostScope,
} from "../../src/domain/executorCompatibility/index.js";
import {
  ExclusiveFileLockManager,
  FileExecutorCompatibilityEvidenceStore,
  FileExecutorCompatibilityMatrixStore,
  FileParentDirectoryDurability,
  resolveExecutorCompatibilityArtifactStorePaths,
  resolveExecutorCompatibilityEvidenceStorePaths,
  resolveExecutorCompatibilityMatrixStorePaths,
  type ExclusiveFileLockHandle,
  type FileLockManager,
  type TaskLockContext,
} from "../../src/infrastructure/persistence/index.js";
import { Rfc8785Sha256DigestAdapter } from "../../src/infrastructure/serialization/index.js";
import { TemporaryRuntimeStore } from "../support/runtime/index.js";

const runtimeStores = new TemporaryRuntimeStore();
const digest = new Rfc8785Sha256DigestAdapter();

/** 构造同 Artifact 摘要来源身份冲突的测试维度。 */
enum SourceIdentityConflictKind {
  /** 来源 Schema 版本冲突。 */
  Schema = "schema",
  /** 来源 Locator 冲突。 */
  Locator = "locator",
}

afterEach(async () => runtimeStores.cleanup());

describe("File Executor Compatibility Stores", () => {
  it("跨实例持久化 Artifact、Evidence、Matrix 与 Policy，并幂等复用相同内容", async () => {
    const storeRoot = await runtimeStores.create("liushi-executor-compatibility-");
    const fixture = createFixture();
    const firstEvidence = await createEvidenceStore(storeRoot).persist(fixture.projection);
    const reusedEvidence = await createEvidenceStore(storeRoot).persist(fixture.projection);
    const firstMatrix = await createMatrixStore(storeRoot).persist(fixture.record);
    const reusedMatrix = await createMatrixStore(storeRoot).persist(fixture.record);

    expect(firstEvidence).toEqual({
      status: ResultStatus.Success,
      value: {
        disposition: ExecutorCompatibilityWriteDisposition.Persisted,
        artifactDigest: fixture.projection.artifactDigest,
        evidenceDigests: fixture.projection.evidence.map((item) => item.evidenceDigest),
      },
    });
    expect(reusedEvidence).toEqual({
      status: ResultStatus.Success,
      value: {
        disposition: ExecutorCompatibilityWriteDisposition.IdempotentReuse,
        artifactDigest: fixture.projection.artifactDigest,
        evidenceDigests: fixture.projection.evidence.map((item) => item.evidenceDigest),
      },
    });
    expect(firstMatrix).toEqual({
      status: ResultStatus.Success,
      value: {
        disposition: ExecutorCompatibilityWriteDisposition.Persisted,
        matrixDigest: fixture.record.matrix.matrixDigest,
      },
    });
    expect(reusedMatrix).toEqual({
      status: ResultStatus.Success,
      value: {
        disposition: ExecutorCompatibilityWriteDisposition.IdempotentReuse,
        matrixDigest: fixture.record.matrix.matrixDigest,
      },
    });

    expect(
      await createEvidenceStore(storeRoot).load(fixture.projection.evidence[0]!.evidenceDigest),
    ).toEqual({ status: ResultStatus.Success, value: fixture.projection.evidence[0] });
    expect(
      await createEvidenceStore(storeRoot).loadProjections(
        fixture.projection.evidence.map((item) => item.evidenceDigest),
      ),
    ).toEqual({ status: ResultStatus.Success, value: [fixture.projection] });
    expect(await createMatrixStore(storeRoot).load(fixture.record.matrix.matrixDigest)).toEqual({
      status: ResultStatus.Success,
      value: fixture.record,
    });
    const artifactPaths = resolveExecutorCompatibilityArtifactStorePaths(
      storeRoot,
      fixture.projection.evidence[0]!.source.locator.value,
    );
    expect(JSON.parse(await readFile(artifactPaths.recordFile, "utf8"))).toEqual(
      fixture.projection.artifact,
    );
  });

  it("按完整来源身份恢复两个独立 Artifact，并确定性排序 Projection", async () => {
    const storeRoot = await runtimeStores.create("liushi-executor-compatibility-multi-source-");
    const fixtures = [createFixture("source-a"), createFixture("source-b")];
    for (const fixture of fixtures) {
      await expectSuccess(createEvidenceStore(storeRoot).persist(fixture.projection));
    }
    const requestedDigests = fixtures
      .flatMap((fixture) => fixture.projection.evidence)
      .map((item) => item.evidenceDigest)
      .reverse();

    const loaded = await createEvidenceStore(storeRoot).loadProjections(requestedDigests);

    expect(loaded).toEqual({
      status: ResultStatus.Success,
      value: fixtures
        .map((fixture) => fixture.projection)
        .sort((left, right) => left.artifactDigest.localeCompare(right.artifactDigest)),
    });
  });

  it("恢复 Projection 时拒绝空集合与重复 Evidence 摘要", async () => {
    const storeRoot = await runtimeStores.create("liushi-executor-compatibility-projection-set-");
    const fixture = createFixture();
    await expectSuccess(createEvidenceStore(storeRoot).persist(fixture.projection));
    const evidenceDigest = fixture.projection.evidence[0]!.evidenceDigest;

    expect(await createEvidenceStore(storeRoot).loadProjections([])).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.CorruptStore },
    });
    expect(
      await createEvidenceStore(storeRoot).loadProjections([evidenceDigest, evidenceDigest]),
    ).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.CorruptStore },
    });
  });

  it.each([SourceIdentityConflictKind.Schema, SourceIdentityConflictKind.Locator])(
    "同一 Artifact 摘要绑定不一致的 source %s 时拒绝恢复",
    async (conflictKind) => {
      const storeRoot = await runtimeStores.create(
        `liushi-executor-compatibility-source-${conflictKind}-`,
      );
      const fixture = createFixture();
      const conflictingProjection = createConflictingSourceProjection(
        fixture.projection,
        conflictKind,
      );
      await expectSuccess(createEvidenceStore(storeRoot).persist(fixture.projection));
      await expectSuccess(createEvidenceStore(storeRoot).persist(conflictingProjection));

      expect(
        await createEvidenceStore(storeRoot).loadProjections([
          fixture.projection.evidence[0]!.evidenceDigest,
          conflictingProjection.evidence[0]!.evidenceDigest,
        ]),
      ).toMatchObject({
        status: ResultStatus.Failure,
        error: { code: HarnessErrorCode.CorruptStore },
      });
    },
  );

  it("并发持久化同一 Projection 与 Matrix 不产生冲突内容", async () => {
    const storeRoot = await runtimeStores.create("liushi-executor-compatibility-concurrent-");
    const fixture = createFixture();
    const evidenceResults = await Promise.all([
      createEvidenceStore(storeRoot).persist(fixture.projection),
      createEvidenceStore(storeRoot).persist(fixture.projection),
    ]);
    const matrixResults = await Promise.all([
      createMatrixStore(storeRoot).persist(fixture.record),
      createMatrixStore(storeRoot).persist(fixture.record),
    ]);

    assertConcurrentOutcomes(evidenceResults);
    assertConcurrentOutcomes(matrixResults);
    expect(
      await createEvidenceStore(storeRoot).load(fixture.projection.evidence[0]!.evidenceDigest),
    ).toMatchObject({ status: ResultStatus.Success });
    expect(
      await createMatrixStore(storeRoot).load(fixture.record.matrix.matrixDigest),
    ).toMatchObject({ status: ResultStatus.Success });
  });

  it.each(["artifact", "evidence", "matrix", "policy"] as const)(
    "读取时拒绝被篡改的 %s 内容",
    async (target) => {
      const storeRoot = await runtimeStores.create(`liushi-executor-compatibility-${target}-`);
      const fixture = createFixture();
      await persistFixture(storeRoot, fixture);

      if (target === "artifact") {
        const paths = resolveExecutorCompatibilityArtifactStorePaths(
          storeRoot,
          fixture.projection.evidence[0]!.source.locator.value,
        );
        const value = JSON.parse(await readFile(paths.recordFile, "utf8")) as Record<
          string,
          unknown
        >;
        await writeFile(
          paths.recordFile,
          `${JSON.stringify({ ...value, tampered: true })}\n`,
          "utf8",
        );
      } else if (target === "evidence") {
        const evidence = fixture.projection.evidence[0]!;
        const paths = resolveExecutorCompatibilityEvidenceStorePaths(
          storeRoot,
          evidence.evidenceDigest,
        );
        await writeFile(
          paths.recordFile,
          `${JSON.stringify({ ...evidence, outcome: ExecutorEvidenceOutcome.Failed })}\n`,
          "utf8",
        );
      } else {
        const paths = resolveExecutorCompatibilityMatrixStorePaths(
          storeRoot,
          fixture.record.matrix.matrixDigest,
        );
        const record = JSON.parse(await readFile(paths.recordFile, "utf8")) as Record<
          string,
          Record<string, unknown>
        >;
        const tampered =
          target === "matrix"
            ? { ...record, matrix: { ...record["matrix"], profileId: "tampered.profile" } }
            : { ...record, policy: { ...record["policy"], policyId: "tampered.policy" } };
        await writeFile(paths.recordFile, `${JSON.stringify(tampered)}\n`, "utf8");
      }

      const repersisted =
        target === "artifact" || target === "evidence"
          ? await createEvidenceStore(storeRoot).persist(fixture.projection)
          : await createMatrixStore(storeRoot).persist(fixture.record);
      expect(repersisted).toMatchObject({
        status: ResultStatus.Failure,
        error: { code: HarnessErrorCode.CorruptStore },
      });
      const loaded =
        target === "artifact" || target === "evidence"
          ? await createEvidenceStore(storeRoot).load(
              fixture.projection.evidence[0]!.evidenceDigest,
            )
          : await createMatrixStore(storeRoot).load(fixture.record.matrix.matrixDigest);
      expect(loaded).toMatchObject({
        status: ResultStatus.Failure,
        error: { code: HarnessErrorCode.CorruptStore },
      });
    },
  );

  it("Evidence 存在但 source Artifact 缺失时返回 CorruptStore", async () => {
    const storeRoot = await runtimeStores.create("liushi-executor-compatibility-orphan-");
    const fixture = createFixture();
    await expectSuccess(createEvidenceStore(storeRoot).persist(fixture.projection));
    const artifactPaths = resolveExecutorCompatibilityArtifactStorePaths(
      storeRoot,
      fixture.projection.evidence[0]!.source.locator.value,
    );
    await rm(artifactPaths.recordFile);

    expect(
      await createEvidenceStore(storeRoot).load(fixture.projection.evidence[0]!.evidenceDigest),
    ).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.CorruptStore },
    });
  });

  it("拒绝非法 Digest 与逃逸 Runtime Store Locator", async () => {
    const storeRoot = await runtimeStores.create("liushi-executor-compatibility-invalid-");
    const fixture = createFixture();
    const unsafeEvidence = {
      ...fixture.projection.evidence[0]!,
      source: {
        ...fixture.projection.evidence[0]!.source,
        locator: {
          kind: ExecutorEvidenceLocatorKind.RuntimeStore,
          value: "../escaped-artifact.json",
        },
      },
    };

    expect(
      await createEvidenceStore(storeRoot).persist({
        ...fixture.projection,
        evidence: [unsafeEvidence],
      }),
    ).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.InvalidInput },
    });
    expect(
      await createEvidenceStore(storeRoot).load("sha256:../escape" as ContentDigest),
    ).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.InvalidInput },
    });
    expect(await createMatrixStore(storeRoot).load("sha256:ABC" as ContentDigest)).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.InvalidInput },
    });
  });

  it("拒绝安全但未绑定 Artifact Digest 的 Runtime Store Locator", async () => {
    const storeRoot = await runtimeStores.create("liushi-executor-compatibility-alias-");
    const fixture = createFixture();
    const original = fixture.projection.evidence[0]!;
    const withoutDigest: Omit<ExecutorCapabilityEvidence, "evidenceDigest"> = {
      ...original,
      source: {
        ...original.source,
        locator: {
          kind: ExecutorEvidenceLocatorKind.RuntimeStore,
          value: "executorCompatibility/codex/safe-alias.json",
        },
      },
    };
    const aliasedEvidence: ExecutorCapabilityEvidence = {
      ...withoutDigest,
      evidenceDigest: calculateDigest(createExecutorCapabilityEvidenceDigestInput(withoutDigest)),
    };

    expect(
      await createEvidenceStore(storeRoot).persist({
        ...fixture.projection,
        evidence: [aliasedEvidence],
      }),
    ).toMatchObject({
      status: ResultStatus.Failure,
      error: {
        code: HarnessErrorCode.InvalidInput,
        details: { field: "source.locator.value" },
      },
    });
  });

  it("合法但不存在的 Evidence 与 Matrix Digest 返回各自 NotFound", async () => {
    const storeRoot = await runtimeStores.create("liushi-executor-compatibility-not-found-");
    const evidenceDigest = calculateDigest("missing-evidence");
    const matrixDigest = calculateDigest("missing-matrix");

    expect(await createEvidenceStore(storeRoot).load(evidenceDigest)).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.ExecutorCompatibilityEvidenceNotFound },
    });
    expect(await createMatrixStore(storeRoot).load(matrixDigest)).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.ExecutorCompatibilityMatrixNotFound },
    });
  });

  it("写后父目录耐久性失败返回 ExecutorCompatibilityCommitOutcomeUnknown", async () => {
    const storeRoot = await runtimeStores.create("liushi-executor-compatibility-durability-");
    const fixture = createFixture();
    const store = createEvidenceStore(storeRoot, {
      syncParentDirectory: () => Promise.reject(new Error("injected directory fsync failure")),
    });

    expect(await store.persist(fixture.projection)).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.ExecutorCompatibilityCommitOutcomeUnknown },
    });
  });

  it("写后锁释放失败返回 ExecutorCompatibilityCommitOutcomeUnknown", async () => {
    const storeRoot = await runtimeStores.create("liushi-executor-compatibility-release-");
    const fixture = createFixture();
    const store = createMatrixStore(
      storeRoot,
      new FileParentDirectoryDurability(),
      new ReleaseFailureLockManager(),
    );

    expect(await store.persist(fixture.record)).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.ExecutorCompatibilityCommitOutcomeUnknown },
    });
    expect(
      await createMatrixStore(storeRoot).load(fixture.record.matrix.matrixDigest),
    ).toMatchObject({ status: ResultStatus.Success });
  });

  it("写前锁失败保留稳定 LockUnavailable，且不升级为提交结果未知", async () => {
    const storeRoot = await runtimeStores.create("liushi-executor-compatibility-lock-");
    const fixture = createFixture();
    const store = createMatrixStore(
      storeRoot,
      new FileParentDirectoryDurability(),
      new AcquireFailureLockManager(),
    );

    expect(await store.persist(fixture.record)).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.LockUnavailable },
    });
  });
});

function createFixture(sourceRun = "primary"): {
  readonly projection: ExecutorCompatibilityEvidenceProjection;
  readonly record: ExecutorCompatibilityMatrixRecord;
} {
  const scope: ExecutorHostScope = {
    adapterKind: ExecutorAdapterKind.Codex,
    distribution: ExecutorDistribution.CodexCli,
    adapterDigest: calculateDigest({ adapter: "integration-test" }),
    executorVersion: "1.0.0",
    surface: ExecutorHostSurface.InteractiveTui,
    operatingSystem: ExecutorOperatingSystem.Windows,
    architecture: ExecutorArchitecture.X64,
    configurationDigest: calculateDigest({ hooks: "enabled" }),
  };
  const artifact = {
    schemaVersion: "integration-artifact.v1",
    profileId: "managed_file_mutation_hooks.v1",
    sourceRun,
    scope,
    observations: [{ checkId: "hook_framework_enabled", outcome: "passed" }],
  };
  const artifactDigest = calculateDigest(artifact);
  const artifactHex = artifactDigest.slice("sha256:".length);
  const withoutDigest: Omit<ExecutorCapabilityEvidence, "evidenceDigest"> = {
    schemaVersion: EXECUTOR_CAPABILITY_EVIDENCE_SCHEMA_VERSION,
    scope,
    capability: ExecutorCapability.CommandHookHandler,
    kind: ExecutorEvidenceKind.StaticProbe,
    outcome: ExecutorEvidenceOutcome.Passed,
    qualifiers: [
      {
        kind: ExecutorCapabilityQualifierKind.CanonicalAction,
        value: "file_mutation",
      },
    ],
    source: {
      artifactDigest,
      locator: {
        kind: ExecutorEvidenceLocatorKind.RuntimeStore,
        value: `executorCompatibility/codex/${artifactHex}.json`,
      },
      schemaVersion: "integration-artifact.v1",
      checkIds: ["hook_framework_enabled"],
      observedAt: "2026-07-15T00:00:00.000Z",
    },
  };
  const evidence: ExecutorCapabilityEvidence = {
    ...withoutDigest,
    evidenceDigest: calculateDigest(createExecutorCapabilityEvidenceDigestInput(withoutDigest)),
  };
  const policy = createManagedFileMutationHookPolicy();
  const compiled = compileExecutorCompatibilityMatrix(
    { scope, policy, evidence: [evidence] },
    digest,
  );
  if (compiled.status === ResultStatus.Failure) throw compiled.error;
  return {
    projection: { artifact, artifactDigest, evidence: [evidence] },
    record: { matrix: compiled.value, policy },
  };
}

function createConflictingSourceProjection(
  projection: ExecutorCompatibilityEvidenceProjection,
  conflictKind: SourceIdentityConflictKind,
): ExecutorCompatibilityEvidenceProjection {
  const original = projection.evidence[0];
  if (original === undefined) throw new Error("测试 Evidence 缺失。");
  const scope =
    conflictKind === SourceIdentityConflictKind.Locator
      ? { ...original.scope, adapterKind: ExecutorAdapterKind.GenericCli }
      : original.scope;
  const artifactHex = projection.artifactDigest.slice("sha256:".length);
  const withoutDigest: Omit<ExecutorCapabilityEvidence, "evidenceDigest"> = {
    ...original,
    scope,
    source: {
      ...original.source,
      schemaVersion:
        conflictKind === SourceIdentityConflictKind.Schema
          ? "integration-artifact.v2"
          : original.source.schemaVersion,
      locator:
        conflictKind === SourceIdentityConflictKind.Locator
          ? {
              kind: ExecutorEvidenceLocatorKind.RuntimeStore,
              value: `executorCompatibility/generic_cli/${artifactHex}.json`,
            }
          : original.source.locator,
    },
  };
  return {
    ...projection,
    evidence: [
      {
        ...withoutDigest,
        evidenceDigest: calculateDigest(createExecutorCapabilityEvidenceDigestInput(withoutDigest)),
      },
    ],
  };
}

function createEvidenceStore(
  storeRoot: string,
  parentDirectoryDurability: {
    syncParentDirectory: FileParentDirectoryDurability["syncParentDirectory"];
  } = new FileParentDirectoryDurability(),
  lockManager: FileLockManager = new ExclusiveFileLockManager(),
): FileExecutorCompatibilityEvidenceStore {
  return new FileExecutorCompatibilityEvidenceStore(storeRoot, {
    lockManager,
    parentDirectoryDurability,
    digest,
  });
}

function createMatrixStore(
  storeRoot: string,
  parentDirectoryDurability: {
    syncParentDirectory: FileParentDirectoryDurability["syncParentDirectory"];
  } = new FileParentDirectoryDurability(),
  lockManager: FileLockManager = new ExclusiveFileLockManager(),
): FileExecutorCompatibilityMatrixStore {
  return new FileExecutorCompatibilityMatrixStore(storeRoot, {
    lockManager,
    parentDirectoryDurability,
    digest,
  });
}

async function persistFixture(
  storeRoot: string,
  fixture: ReturnType<typeof createFixture>,
): Promise<void> {
  await expectSuccess(createEvidenceStore(storeRoot).persist(fixture.projection));
  await expectSuccess(createMatrixStore(storeRoot).persist(fixture.record));
}

function calculateDigest(input: unknown): ContentDigest {
  const result = digest.calculate(input);
  if (result.status === ResultStatus.Failure) throw result.error;
  return result.value;
}

async function expectSuccess<T>(promise: Promise<Result<T, HarnessError>>): Promise<T> {
  const result = await promise;
  if (result.status === ResultStatus.Failure) throw result.error;
  return result.value;
}

function assertConcurrentOutcomes(results: readonly Result<unknown, HarnessError>[]): void {
  expect(results.some((result) => result.status === ResultStatus.Success)).toBe(true);
  for (const result of results) {
    if (result.status === ResultStatus.Failure) {
      expect([
        HarnessErrorCode.LockUnavailable,
        HarnessErrorCode.ExecutorCompatibilityCommitOutcomeUnknown,
      ]).toContain(result.error.code);
    }
  }
}

/** 在真实锁清理完成后注入释放失败。 */
class ReleaseFailureLockManager implements FileLockManager {
  private readonly delegate = new ExclusiveFileLockManager();

  public async acquire(
    lockFile: string,
    context: TaskLockContext,
  ): Promise<ExclusiveFileLockHandle> {
    const handle = await this.delegate.acquire(lockFile, context);
    return {
      release: async (): Promise<void> => {
        await handle.release();
        throw new Error("injected lock release failure");
      },
    };
  }
}

/** 在任何文件写入前注入稳定锁冲突。 */
class AcquireFailureLockManager implements FileLockManager {
  public acquire(): Promise<ExclusiveFileLockHandle> {
    return Promise.reject(
      new HarnessError(HarnessErrorCode.LockUnavailable, "injected lock acquisition failure"),
    );
  }
}
