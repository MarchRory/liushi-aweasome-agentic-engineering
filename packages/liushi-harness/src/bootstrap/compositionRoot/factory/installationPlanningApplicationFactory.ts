import { CreateInstallPlanUseCase } from "#application/index.js";
import type { ContentDigestPort, ManagedOwnershipVerifier } from "#application/ports/index.js";
import type { Clock, IdGenerator } from "#common/index.js";
import {
  CodexInstallProfileProjectorAdapter,
  FileInstallPlanStore,
  NodeManagedFileStateReaderAdapter,
} from "#infrastructure/index.js";
import type {
  FileLockManager,
  ParentDirectoryDurability,
} from "#infrastructure/persistence/fileEventStore/index.js";

/** 创建 G0 Managed Files 安装规划的组合根局部对象。 */
export function createInstallationPlanningApplication(
  storeRoot: string,
  packageVersion: string,
  digest: ContentDigestPort,
  clock: Clock,
  idGenerator: IdGenerator,
  lockManager: FileLockManager,
  parentDirectoryDurability: ParentDirectoryDurability,
  ownershipVerifier: ManagedOwnershipVerifier,
): CreateInstallPlanUseCase {
  return new CreateInstallPlanUseCase(
    new NodeManagedFileStateReaderAdapter(digest),
    new CodexInstallProfileProjectorAdapter(packageVersion, digest),
    new FileInstallPlanStore(storeRoot, {
      lockManager,
      parentDirectoryDurability,
      digest,
      ownershipVerifier,
    }),
    ownershipVerifier,
    digest,
    clock,
    idGenerator,
  );
}
