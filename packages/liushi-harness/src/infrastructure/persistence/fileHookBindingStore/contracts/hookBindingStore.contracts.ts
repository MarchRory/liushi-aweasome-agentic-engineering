import type {
  FileLockManager,
  ParentDirectoryDurability,
} from "#infrastructure/persistence/fileEventStore/index.js";

/** File Hook Binding Store 的基础设施依赖。 */
export interface FileHookBindingStoreDependencies {
  /** 保护多进程绑定更新的排他 Lock。 */
  readonly lockManager: FileLockManager;
  /** 原子 rename 后刷新父目录的能力。 */
  readonly parentDirectoryDurability: ParentDirectoryDurability;
}
