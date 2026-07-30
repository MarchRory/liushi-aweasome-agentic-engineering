import type { CodingTaskSessionCloseoutState } from "#application/codingTaskSessionCloseoutState/index.js";
import type {
  AgentSessionProcessEvidenceStore,
  ActionJournalRepository,
  CodingTaskSessionActivationRepository,
  CodingTaskSessionCloseoutStateStore,
  ContentDigestPort,
  EvidenceBundleStore,
  PilotMetricsCreateResult,
  PilotMetricsStore,
} from "#application/ports/index.js";
import type { ContentDigest, HarnessError, Result } from "#common/index.js";
import type { ActionJournalState, ActionJournalStatus } from "#domain/actionJournal/index.js";
import type { AgentSessionProcessEvidence } from "#domain/agentSessionProcessEvidence/index.js";
import type { CodingTaskSessionActivationRecord } from "#domain/codingTaskSession/index.js";
import type {
  PilotEnrollment,
  PilotEnrollmentInput,
  PilotSettlement,
  PilotSettlementInput,
} from "#domain/pilotMetrics/index.js";
import type { EvidenceBundle, VerificationStatus } from "#domain/verification/index.js";

import type {
  PilotMetricsClaimEligibility,
  PilotMetricsMissingFact,
  PilotMetricsReportStatus,
} from "../enums/index.js";

/** Pilot Metrics Application 使用的权威 Store 集合。 */
export interface PilotMetricsApplicationDependencies {
  /** Pilot 原始事实 Store。 */
  readonly pilotMetricsStore: PilotMetricsStore;
  /** Session Activation 权威 Repository。 */
  readonly activationRepository: CodingTaskSessionActivationRepository;
  /** 受信宿主 Agent Process Evidence Store。 */
  readonly processEvidenceStore: AgentSessionProcessEvidenceStore;
  /** Session Closeout 权威状态 Store。 */
  readonly closeoutStateStore: CodingTaskSessionCloseoutStateStore<CodingTaskSessionCloseoutState>;
  /** Verification EvidenceBundle 权威存储。 */
  readonly evidenceBundleStore: EvidenceBundleStore;
  /** 生成 Verification Evidence 的 Action Journal Repository。 */
  readonly actionJournalRepository: ActionJournalRepository;
  /** RFC 8785 内容摘要端口。 */
  readonly contentDigest: ContentDigestPort;
  /** 仅受信宿主可开启；默认 CLI 必须拒绝 `observed` Human Touch。 */
  readonly allowObservedHumanTouch?: boolean;
}

/** 已完成交叉验证的单 Session 权威证据集合。 */
export interface PilotMetricsBoundEvidence {
  /** 不可变 Activation Record。 */
  readonly activation: CodingTaskSessionActivationRecord;
  /** 受信宿主进程证据。 */
  readonly processEvidence: AgentSessionProcessEvidence;
  /** 已停在 CheckpointBound 的 Closeout State。 */
  readonly closeoutState: CodingTaskSessionCloseoutState;
  /** 与 Closeout Revision 双向匹配的 EvidenceBundle。 */
  readonly evidenceBundle: EvidenceBundle;
  /** 生成该 EvidenceBundle 的终态 Action Journal。 */
  readonly verificationActionJournal: ActionJournalState;
  /** Closeout Checkpoint 联合绑定摘要。 */
  readonly checkpointBindingDigest: ContentDigest;
  /** EvidenceBundle 的规范内容摘要。 */
  readonly evidenceBundleDigest: ContentDigest;
}

/** 不含敏感原文的证据摘要投影。 */
export interface PilotMetricsEvidenceProjection {
  /** Activation 绑定摘要。 */
  readonly activationBindingDigest: ContentDigest;
  /** Agent Process Evidence 摘要。 */
  readonly processEvidenceDigest: ContentDigest;
  /** Closeout Checkpoint 绑定摘要。 */
  readonly checkpointBindingDigest: ContentDigest;
  /** Verification EvidenceBundle 摘要。 */
  readonly evidenceBundleDigest: ContentDigest;
  /** 生成 Verification EvidenceBundle 的 Action 标识。 */
  readonly verificationActionId: string;
  /** Verification Action Journal 的最终状态。 */
  readonly verificationActionStatus: ActionJournalStatus;
  /** 受信宿主观察的机器执行时长。 */
  readonly machineDurationMs: number;
  /** 实际执行器标识。 */
  readonly executorId: string;
  /** 实际执行器版本。 */
  readonly executorVersion: string;
  /** 实际模型标识。 */
  readonly modelId: string;
  /** 实际权限模式。 */
  readonly permissionMode: string;
  /** Closeout 绑定的基础 Revision。 */
  readonly repositoryBaseRevision: string;
  /** Verification 观察的目标 Revision。 */
  readonly repositoryTargetRevision: string;
  /** Verification 的闭合结果。 */
  readonly verificationStatus: VerificationStatus;
}

/** 单 Session Pilot Metrics 只读报告。 */
export interface PilotMetricsReport {
  /** 报告是否具备完整描述性事实。 */
  readonly status: PilotMetricsReportStatus;
  /** 当前数据只允许的声明等级。 */
  readonly claimEligibility: PilotMetricsClaimEligibility;
  /** 缺失的原始事实。 */
  readonly missingFacts: readonly PilotMetricsMissingFact[];
  /** 已存在的 Enrollment。 */
  readonly enrollment: PilotEnrollment | null;
  /** 已存在的 Settlement。 */
  readonly settlement: PilotSettlement | null;
  /** 全部权威证据通过交叉验证后才存在。 */
  readonly evidence: PilotMetricsEvidenceProjection | null;
}

/** Enrollment 写入结果。 */
export type PilotMetricsEnrollmentResult = Result<
  PilotMetricsCreateResult<PilotEnrollment>,
  HarnessError
>;

/** Settlement 写入结果。 */
export type PilotMetricsSettlementResult = Result<
  PilotMetricsCreateResult<PilotSettlement>,
  HarnessError
>;

/** Pilot Metrics 报告查询结果。 */
export type PilotMetricsReportResult = Result<PilotMetricsReport, HarnessError>;

/** Application 接收的不含摘要 Enrollment Draft。 */
export type PilotMetricsEnrollmentDraft = PilotEnrollmentInput;

/** Application 接收的不含摘要 Settlement Draft。 */
export type PilotMetricsSettlementDraft = PilotSettlementInput;
