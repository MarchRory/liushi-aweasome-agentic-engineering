import type {
  FileLockManager,
  ParentDirectoryDurability,
} from "#infrastructure/persistence/fileEventStore/index.js";
import type { HookBindingDigestPort } from "#application/executorHooks/index.js";

/** File Hook Binding Store 的基础设施依赖。 */
export interface FileHookBindingStoreDependencies {
  /** 保护多进程绑定更新的排他 Lock。 */
  readonly lockManager: FileLockManager;
  /** 原子 rename 后刷新父目录的能力。 */
  readonly parentDirectoryDurability: ParentDirectoryDurability;
  /** 用于校验和重算 Session Binding Digest 的最小 Port。 */
  readonly digest?: HookBindingDigestPort;
}
