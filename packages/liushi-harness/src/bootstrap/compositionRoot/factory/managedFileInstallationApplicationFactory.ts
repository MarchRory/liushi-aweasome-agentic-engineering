import type { ContentDigestPort, RepositoryLockPort } from "#application/ports/index.js";
import type { Clock, IdGenerator } from "#common/index.js";
import { FileInstallationRevisionStore, UlidGenerator } from "#infrastructure/index.js";
import type {
  FileLockManager,
  ParentDirectoryDurability,
} from "#infrastructure/persistence/fileEventStore/index.js";

import { createInstallationApplyApplication } from "./installationApplyApplicationFactory.js";
import { createInstallationPlanningApplication } from "./installationPlanningApplicationFactory.js";

/** Managed File 安装装配所需的外部可选项。 */
interface ManagedFileInstallationFactoryOptions {
  /** Runtime Store 根目录。 */
  readonly storeRoot: string;
  /** 写入 Manifest 的 Harness 包版本。 */
  readonly packageVersion?: string;
  /** 可覆盖的 InstallPlan ID 生成器。 */
  readonly installPlanIdGenerator?: IdGenerator;
  /** 可覆盖的 Installation Revision ID 生成器。 */
  readonly installationRevisionIdGenerator?: IdGenerator;
}

/** Managed File 安装装配复用的基础设施。 */
interface ManagedFileInstallationFactoryDependencies {
  /** 结构化内容摘要实现。 */
  readonly digest: ContentDigestPort;
  /** 审计时间来源。 */
  readonly clock: Clock;
  /** Runtime Store 文件锁管理器。 */
  readonly lockManager: FileLockManager;
  /** 原子写入后的父目录耐久性实现。 */
  readonly parentDirectoryDurability: ParentDirectoryDurability;
  /** Repository 级排他锁。 */
  readonly repositoryLock: RepositoryLockPort;
}

/** 统一装配共享同一权威 Revision Store 的安装计划与 Apply 能力。 */
export function createManagedFileInstallationApplication(
  options: ManagedFileInstallationFactoryOptions,
  dependencies: ManagedFileInstallationFactoryDependencies,
): {
  /** 生成只读 InstallPlan。 */
  readonly createInstallPlan: ReturnType<typeof createInstallationPlanningApplication>;
  /** 应用精确 G0 批准。 */
  readonly applyInstallPlan: ReturnType<typeof createInstallationApplyApplication>;
} {
  const revisionStore = new FileInstallationRevisionStore(options.storeRoot, {
    lockManager: dependencies.lockManager,
    parentDirectoryDurability: dependencies.parentDirectoryDurability,
    digest: dependencies.digest,
  });
  const planIdGenerator = options.installPlanIdGenerator ?? new UlidGenerator();
  const revisionIdGenerator = options.installationRevisionIdGenerator ?? new UlidGenerator();

  return {
    createInstallPlan: createInstallationPlanningApplication(
      options.storeRoot,
      options.packageVersion ?? "development",
      dependencies.digest,
      dependencies.clock,
      planIdGenerator,
      dependencies.lockManager,
      dependencies.parentDirectoryDurability,
      revisionStore,
    ),
    applyInstallPlan: createInstallationApplyApplication(
      options.storeRoot,
      dependencies.digest,
      dependencies.clock,
      revisionIdGenerator,
      dependencies.lockManager,
      dependencies.parentDirectoryDurability,
      revisionStore,
      dependencies.repositoryLock,
    ),
  };
}
