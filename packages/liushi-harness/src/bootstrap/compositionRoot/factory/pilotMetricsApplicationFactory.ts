import { PilotMetricsService } from "#application/index.js";
import type {
  ActionJournalRepository,
  CodingTaskSessionActivationRepository,
  EvidenceBundleStore,
} from "#application/ports/index.js";
import {
  FileAgentSessionProcessEvidenceStore,
  FileCodingTaskSessionCloseoutStore,
  FilePilotMetricsStore,
  type FileCodingTaskSessionActivationRepositoryDependencies,
} from "#infrastructure/index.js";

/** Pilot Metrics Application 的装配输入。 */
export interface PilotMetricsApplicationFactoryInput {
  /** Runtime Store 根目录。 */
  readonly storeRoot: string;
  /** 文件 Store 共享的摘要、锁与目录耐久化依赖。 */
  readonly storeDependencies: FileCodingTaskSessionActivationRepositoryDependencies;
  /** Session Activation 权威 Repository。 */
  readonly activationRepository: CodingTaskSessionActivationRepository;
  /** Verification EvidenceBundle 权威存储。 */
  readonly evidenceBundleStore: EvidenceBundleStore;
  /** 生成 Verification Evidence 的 Action Journal Repository。 */
  readonly actionJournalRepository: ActionJournalRepository;
}

/** 装配 executor-neutral 的 Pilot Metrics 度量平面。 */
export function createPilotMetricsApplication(
  input: PilotMetricsApplicationFactoryInput,
): PilotMetricsService {
  return new PilotMetricsService({
    pilotMetricsStore: new FilePilotMetricsStore(input.storeRoot, input.storeDependencies),
    activationRepository: input.activationRepository,
    processEvidenceStore: new FileAgentSessionProcessEvidenceStore(
      input.storeRoot,
      input.storeDependencies,
    ),
    closeoutStateStore: new FileCodingTaskSessionCloseoutStore(
      input.storeRoot,
      input.storeDependencies,
    ),
    evidenceBundleStore: input.evidenceBundleStore,
    actionJournalRepository: input.actionJournalRepository,
    contentDigest: input.storeDependencies.digest,
    allowObservedHumanTouch: false,
  });
}
