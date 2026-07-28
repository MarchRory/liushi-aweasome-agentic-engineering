import { RecordAgentSessionProcessEvidenceService } from "#application/index.js";
import type {
  CodingTaskSessionActivationRepository,
  CodingTaskSessionAdmissionStateStore,
  ContentDigestPort,
} from "#application/ports/index.js";
import {
  FileAgentSessionProcessEvidenceStore,
  type FileAgentSessionProcessEvidenceStoreDependencies,
} from "#infrastructure/index.js";

/** Agent 进程证据应用服务的 Bootstrap 装配输入。 */
export interface AgentSessionProcessEvidenceApplicationFactoryInput {
  /** Runtime Store 根目录。 */
  readonly storeRoot: string;
  /** 文件 Store 共享基础设施。 */
  readonly storeDependencies: FileAgentSessionProcessEvidenceStoreDependencies;
  /** 权威 Activation Repository。 */
  readonly activationRepository: CodingTaskSessionActivationRepository;
  /** 权威 Admission State Store。 */
  readonly admissionStateStore: CodingTaskSessionAdmissionStateStore;
  /** RFC 8785 摘要端口。 */
  readonly digest: ContentDigestPort;
}

/** 创建仅供受信宿主调用的进程证据 Recorder。 */
export function createAgentSessionProcessEvidenceApplication(
  input: AgentSessionProcessEvidenceApplicationFactoryInput,
): RecordAgentSessionProcessEvidenceService {
  return new RecordAgentSessionProcessEvidenceService({
    activationRepository: input.activationRepository,
    admissionStateStore: input.admissionStateStore,
    evidenceStore: new FileAgentSessionProcessEvidenceStore(
      input.storeRoot,
      input.storeDependencies,
    ),
    contentDigest: input.digest,
  });
}
