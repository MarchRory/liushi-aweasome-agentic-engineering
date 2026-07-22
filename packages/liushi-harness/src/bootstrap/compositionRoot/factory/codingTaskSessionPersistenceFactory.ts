import type {
  CodingTaskSessionActivationLease,
  CodingTaskSessionActivationRepository,
} from "#application/ports/index.js";
import {
  FileCodingTaskSessionActivationLease,
  FileCodingTaskSessionActivationRepository,
  type FileCodingTaskSessionActivationRepositoryDependencies,
} from "#infrastructure/index.js";

/** Session Activation 持久化装配结果。 */
export interface CodingTaskSessionPersistence {
  /** 不可变 Activation Record Repository。 */
  readonly activationRepository: CodingTaskSessionActivationRepository;
  /** 覆盖完整 Activation 临界区的跨进程 Lease。 */
  readonly activationLease: CodingTaskSessionActivationLease;
}

/** 在 Bootstrap 层集中创建 Session Activation 的文件持久化 Adapter。 */
export function createCodingTaskSessionPersistence(
  storeRoot: string,
  dependencies: FileCodingTaskSessionActivationRepositoryDependencies,
): CodingTaskSessionPersistence {
  return {
    activationRepository: new FileCodingTaskSessionActivationRepository(storeRoot, dependencies),
    activationLease: new FileCodingTaskSessionActivationLease(storeRoot, {
      lockManager: dependencies.lockManager,
    }),
  };
}
