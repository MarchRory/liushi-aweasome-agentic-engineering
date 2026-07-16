import { afterEach, describe, expect, it } from "vitest";

import {
  CompileCodexExecutorCompatibilityUseCase,
  ExecutorCompatibilityWriteDisposition,
  QueryExecutorCompatibilityUseCase,
} from "../../src/application/index.js";
import { createHarnessApplication } from "../../src/bootstrap/index.js";
import { HarnessErrorCode, ResultStatus } from "../../src/common/index.js";
import {
  ExecutorEvidenceKind,
  ExecutorEvidenceLocatorKind,
  ExecutorSupportLevel,
  compileExecutorCompatibilityMatrix,
  createManagedFileMutationHookPolicy,
} from "../../src/domain/executorCompatibility/index.js";
import {
  CODEX_COMPATIBILITY_EVIDENCE_ARTIFACT_SCHEMA_VERSION,
  CODEX_CONTRACT_EVIDENCE_ARTIFACT_SCHEMA_VERSION,
  CodexCompatibilityEvidenceProjectorAdapter,
  CodexContractEvidenceProjectorAdapter,
  CodexHookAdapter,
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
  it("生产应用编译 Compatible 十二条 Evidence，并跨新实例完整重验", async () => {
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
    expect(compiled.value.matrix.supportLevel).toBe(ExecutorSupportLevel.Compatible);
    expect(compiled.value.matrix.evidenceDigests).toHaveLength(12);
    expect(compiled.value.evidencePersistences.map((item) => item.disposition)).toEqual([
      ExecutorCompatibilityWriteDisposition.Persisted,
      ExecutorCompatibilityWriteDisposition.Persisted,
    ]);

    const reader = createHarnessApplication({ storeRoot });
    const queried = await reader.queryExecutorCompatibility.execute(
      compiled.value.matrix.matrixDigest,
    );

    expect(queried).toEqual({
      status: ResultStatus.Success,
      value: { matrix: compiled.value.matrix, recomputed: true },
    });
  });

  it("一次 Compile 生成的同一 Matrix 恢复为 Host 与 Contract 两种 Artifact", async () => {
    const storeRoot = await runtimeStores.create("liushi-executor-compatibility-multi-source-");
    const fixture = createCodexCompatibilitySourceFixture();
    const application = createHarnessApplication({ storeRoot });
    const compiled = await application.compileCodexExecutorCompatibility.execute(fixture);
    expect(compiled.status).toBe(ResultStatus.Success);
    if (compiled.status === ResultStatus.Failure) throw compiled.error;

    const dependencies = createStoreDependencies();
    const evidenceStore = new FileExecutorCompatibilityEvidenceStore(storeRoot, dependencies);
    const loaded = await evidenceStore.loadProjections(compiled.value.matrix.evidenceDigests);
    expect(loaded.status).toBe(ResultStatus.Success);
    if (loaded.status === ResultStatus.Failure) throw loaded.error;
    expect(loaded.value).toHaveLength(2);
    const host = loaded.value.find(
      (projection) =>
        readArtifactString(projection.artifact, "schemaVersion") ===
        CODEX_COMPATIBILITY_EVIDENCE_ARTIFACT_SCHEMA_VERSION,
    );
    const contract = loaded.value.find(
      (projection) =>
        readArtifactString(projection.artifact, "schemaVersion") ===
        CODEX_CONTRACT_EVIDENCE_ARTIFACT_SCHEMA_VERSION,
    );
    expect(host?.evidence).toHaveLength(7);
    expect(contract?.evidence).toHaveLength(5);
    if (host === undefined || contract === undefined) {
      throw new Error("恢复的 Projection 集合缺少 Host 或 Contract 来源。");
    }
    expect(readArtifactString(contract.artifact, "hostArtifactDigest")).toBe(host.artifactDigest);
    const kinds = loaded.value.flatMap((projection) =>
      projection.evidence.map((evidence) => evidence.kind),
    );
    expect(kinds).toContain(ExecutorEvidenceKind.ContractTest);
    expect(kinds).not.toContain(ExecutorEvidenceKind.ProductionE2e);
  });

  it("Query 拒绝同 Scope 但绑定其他 Host Artifact Digest 的合法 Contract Projection", async () => {
    const storeRoot = await runtimeStores.create("liushi-executor-compatibility-parent-drift-");
    const fixture = createCodexCompatibilitySourceFixture();
    const dependencies = createStoreDependencies();
    const hostProjector = new CodexCompatibilityEvidenceProjectorAdapter(dependencies.digest);
    const contractProjector = new CodexContractEvidenceProjectorAdapter(
      dependencies.digest,
      CodexHookAdapter,
    );
    const host = hostProjector.project({
      ...fixture,
      artifactLocatorKind: ExecutorEvidenceLocatorKind.RuntimeStore,
    });
    expect(host.status).toBe(ResultStatus.Success);
    if (host.status === ResultStatus.Failure) throw host.error;
    const scope = host.value.evidence[0]?.scope;
    if (scope === undefined) throw new Error("Host Projection 缺少 Scope。");
    const otherHostDigest = calculateDigest(dependencies.digest, { host: "other" });
    const contract = await contractProjector.project({
      scope,
      hostArtifactDigest: otherHostDigest,
      observationAnchor: fixture.hostResult.verifiedAt,
      artifactLocatorKind: ExecutorEvidenceLocatorKind.RuntimeStore,
    });
    expect(contract.status).toBe(ResultStatus.Success);
    if (contract.status === ResultStatus.Failure) throw contract.error;
    expect(contractProjector.verifyPersistedProjection(contract.value).status).toBe(
      ResultStatus.Success,
    );

    const evidenceStore = new FileExecutorCompatibilityEvidenceStore(storeRoot, dependencies);
    expect((await evidenceStore.persist(host.value)).status).toBe(ResultStatus.Success);
    expect((await evidenceStore.persist(contract.value)).status).toBe(ResultStatus.Success);
    const policy = createManagedFileMutationHookPolicy();
    const matrix = compileExecutorCompatibilityMatrix(
      { scope, policy, evidence: [...host.value.evidence, ...contract.value.evidence] },
      dependencies.digest,
    );
    expect(matrix.status).toBe(ResultStatus.Success);
    if (matrix.status === ResultStatus.Failure) throw matrix.error;
    const matrixStore = new FileExecutorCompatibilityMatrixStore(storeRoot, dependencies);
    expect((await matrixStore.persist({ matrix: matrix.value, policy })).status).toBe(
      ResultStatus.Success,
    );

    const queried = await createHarnessApplication({
      storeRoot,
    }).queryExecutorCompatibility.execute(matrix.value.matrixDigest);

    expect(queried).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.CorruptStore },
    });
  });
});

function createStoreDependencies() {
  return {
    digest: new Rfc8785Sha256DigestAdapter(),
    lockManager: new ExclusiveFileLockManager(),
    parentDirectoryDurability: new FileParentDirectoryDurability(),
  };
}

function readArtifactString(artifact: unknown, field: string): string | undefined {
  return isRecord(artifact) && typeof artifact[field] === "string" ? artifact[field] : undefined;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function calculateDigest(digest: Rfc8785Sha256DigestAdapter, input: unknown) {
  const result = digest.calculate(input);
  if (result.status === ResultStatus.Failure) throw result.error;
  return result.value;
}
