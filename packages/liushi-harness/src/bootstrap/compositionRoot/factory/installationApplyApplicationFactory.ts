import { ApplyInstallPlanUseCase } from "#application/index.js";
import type {
  ContentDigestPort,
  InstallationRevisionStore,
  ManagedOwnershipVerifier,
  RepositoryLockPort,
} from "#application/ports/index.js";
import type { Clock, IdGenerator } from "#common/index.js";
import {
  FileInstallPlanStore,
  NodeManagedFileMutationAdapter,
  NodeManagedFileStateReaderAdapter,
} from "#infrastructure/index.js";
import type {
  FileLockManager,
  ParentDirectoryDurability,
} from "#infrastructure/persistence/fileEventStore/index.js";

/** 创建带持久化 Revision、Repository Lock 与原子文件写入的 G0 Apply。 */
export function createInstallationApplyApplication(
  storeRoot: string,
  digest: ContentDigestPort,
  clock: Clock,
  revisionIdGenerator: IdGenerator,
  lockManager: FileLockManager,
  parentDirectoryDurability: ParentDirectoryDurability,
  revisionStore: InstallationRevisionStore & ManagedOwnershipVerifier,
  repositoryLock: RepositoryLockPort,
): ApplyInstallPlanUseCase {
  return new ApplyInstallPlanUseCase(
    new FileInstallPlanStore(storeRoot, {
      lockManager,
      parentDirectoryDurability,
      digest,
      ownershipVerifier: revisionStore,
    }),
    revisionStore,
    new NodeManagedFileStateReaderAdapter(digest),
    new NodeManagedFileMutationAdapter(digest, parentDirectoryDurability),
    repositoryLock,
    digest,
    clock,
    revisionIdGenerator,
  );
}
