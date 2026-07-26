import type {
  CodingTaskSessionAdmissionLease,
  CodingTaskSessionAdmissionStateStore,
  CodingTaskSessionActivationLease,
  CodingTaskSessionActivationRepository,
} from "#application/ports/index.js";
import {
  FileCodingTaskSessionActivationLease,
  FileCodingTaskSessionActivationRepository,
  FileCodingTaskSessionAdmissionLease,
  FileCodingTaskSessionAdmissionStateStore,
  type FileCodingTaskSessionActivationRepositoryDependencies,
} from "#infrastructure/index.js";

/** Session Activation 持久化装配结果。 */
export interface CodingTaskSessionPersistence {
  /** 不可变 Activation Record Repository。 */
  readonly activationRepository: CodingTaskSessionActivationRepository;
  /** 覆盖完整 Activation 临界区的跨进程 Lease。 */
  readonly activationLease: CodingTaskSessionActivationLease;
  /** Session Action Admission 的控制状态 Store。 */
  readonly admissionStateStore: CodingTaskSessionAdmissionStateStore;
  /** 覆盖 Admission State 与 Action Journal 的跨进程 Lease。 */
  readonly admissionLease: CodingTaskSessionAdmissionLease;
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
    admissionStateStore: new FileCodingTaskSessionAdmissionStateStore(storeRoot, {
      parentDirectoryDurability: dependencies.parentDirectoryDurability,
    }),
    admissionLease: new FileCodingTaskSessionAdmissionLease(storeRoot, {
      lockManager: dependencies.lockManager,
    }),
  };
}
