import {
  CompileCodexExecutorCompatibilityUseCase,
  QueryExecutorCompatibilityUseCase,
} from "#application/index.js";
import type { ContentDigestPort } from "#application/ports/index.js";
import {
  CodexCompatibilityEvidenceProjectorAdapter,
  FileExecutorCompatibilityEvidenceStore,
  FileExecutorCompatibilityMatrixStore,
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
} {
  const codexProjector = new CodexCompatibilityEvidenceProjectorAdapter(dependencies.digest);
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

  return {
    compileCodexExecutorCompatibility: new CompileCodexExecutorCompatibilityUseCase(
      codexProjector,
      evidenceStore,
      matrixStore,
      dependencies.digest,
    ),
    queryExecutorCompatibility: new QueryExecutorCompatibilityUseCase(
      codexProjector,
      evidenceStore,
      matrixStore,
      dependencies.digest,
    ),
  };
}
