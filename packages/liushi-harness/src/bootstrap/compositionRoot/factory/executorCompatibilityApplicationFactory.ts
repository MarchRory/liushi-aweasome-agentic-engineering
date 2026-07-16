import {
  CompileCodexExecutorCompatibilityUseCase,
  CreateExecutorCompatibilityPublicationBundleUseCase,
  PublishExecutorCompatibilityPublicationBundleUseCase,
  QueryExecutorCompatibilityUseCase,
} from "#application/index.js";
import type { ContentDigestPort } from "#application/ports/index.js";
import { ExecutorEvidenceKind } from "#domain/executorCompatibility/index.js";
import {
  CODEX_COMPATIBILITY_EVIDENCE_ARTIFACT_SCHEMA_VERSION,
  CODEX_CONTRACT_EVIDENCE_ARTIFACT_SCHEMA_VERSION,
  CodexCompatibilityEvidenceProjectorAdapter,
  CodexContractEvidenceProjectorAdapter,
  CodexHookAdapter,
  FileExecutorCompatibilityEvidenceStore,
  FileExecutorCompatibilityMatrixStore,
  NodeExecutorCompatibilityPublicationWriterAdapter,
  SchemaRoutedExecutorCompatibilityProjectionSetVerifierAdapter,
} from "#infrastructure/index.js";
import type {
  FileLockManager,
  ParentDirectoryDurability,
} from "#infrastructure/persistence/fileEventStore/index.js";

/** Executor Compatibility 装配复用的文件持久化基础设施。 */
interface ExecutorCompatibilityApplicationFactoryDependencies {
  /** 结构化内容摘要实现。 */
  readonly digest: ContentDigestPort;
  /** Runtime Store 文件锁管理器。 */
  readonly lockManager: FileLockManager;
  /** 原子写入后的父目录耐久性实现。 */
  readonly parentDirectoryDurability: ParentDirectoryDurability;
}

/** 装配共享 Runtime Store 的 Executor Compatibility 编译与查询入口。 */
export function createExecutorCompatibilityApplication(
  storeRoot: string,
  dependencies: ExecutorCompatibilityApplicationFactoryDependencies,
): {
  /** 编译并持久化 Codex Executor Compatibility。 */
  readonly compileCodexExecutorCompatibility: CompileCodexExecutorCompatibilityUseCase;
  /** 按 Matrix Digest 重新证明 Executor Compatibility。 */
  readonly queryExecutorCompatibility: QueryExecutorCompatibilityUseCase;
  /** 从精确 Matrix Digest 创建确定性 Publication Bundle。 */
  readonly createExecutorCompatibilityPublicationBundle: CreateExecutorCompatibilityPublicationBundleUseCase;
  /** 创建并原子发布精确 Matrix 对应的 Publication Bundle。 */
  readonly publishExecutorCompatibilityPublicationBundle: PublishExecutorCompatibilityPublicationBundleUseCase;
} {
  const codexHostProjector = new CodexCompatibilityEvidenceProjectorAdapter(dependencies.digest);
  const codexContractProjector = new CodexContractEvidenceProjectorAdapter(
    dependencies.digest,
    CodexHookAdapter,
  );
  const projectionSetVerifier = new SchemaRoutedExecutorCompatibilityProjectionSetVerifierAdapter(
    [
      {
        schemaVersion: CODEX_COMPATIBILITY_EVIDENCE_ARTIFACT_SCHEMA_VERSION,
        exactCount: 1,
        verifier: codexHostProjector,
      },
      {
        schemaVersion: CODEX_CONTRACT_EVIDENCE_ARTIFACT_SCHEMA_VERSION,
        exactCount: 1,
        verifier: codexContractProjector,
      },
    ],
    [
      {
        parentSchemaVersion: CODEX_COMPATIBILITY_EVIDENCE_ARTIFACT_SCHEMA_VERSION,
        dependentSchemaVersion: CODEX_CONTRACT_EVIDENCE_ARTIFACT_SCHEMA_VERSION,
        dependentArtifactDigestField: "hostArtifactDigest",
        dependentObservationAnchorField: "observationAnchor",
        parentObservationKinds: [ExecutorEvidenceKind.SmokeTest, ExecutorEvidenceKind.NegativeTest],
      },
    ],
  );
  const evidenceStore = new FileExecutorCompatibilityEvidenceStore(storeRoot, {
    lockManager: dependencies.lockManager,
    parentDirectoryDurability: dependencies.parentDirectoryDurability,
    digest: dependencies.digest,
  });
  const matrixStore = new FileExecutorCompatibilityMatrixStore(storeRoot, {
    lockManager: dependencies.lockManager,
    parentDirectoryDurability: dependencies.parentDirectoryDurability,
    digest: dependencies.digest,
  });
  const bundleCreator = new CreateExecutorCompatibilityPublicationBundleUseCase(
    projectionSetVerifier,
    evidenceStore,
    matrixStore,
    dependencies.digest,
  );

  return {
    compileCodexExecutorCompatibility: new CompileCodexExecutorCompatibilityUseCase(
      codexHostProjector,
      codexContractProjector,
      projectionSetVerifier,
      evidenceStore,
      matrixStore,
      dependencies.digest,
    ),
    queryExecutorCompatibility: new QueryExecutorCompatibilityUseCase(
      projectionSetVerifier,
      evidenceStore,
      matrixStore,
      dependencies.digest,
    ),
    createExecutorCompatibilityPublicationBundle: bundleCreator,
    publishExecutorCompatibilityPublicationBundle:
      new PublishExecutorCompatibilityPublicationBundleUseCase(
        bundleCreator,
        new NodeExecutorCompatibilityPublicationWriterAdapter(
          dependencies.digest,
          dependencies.parentDirectoryDurability,
        ),
      ),
  };
}
