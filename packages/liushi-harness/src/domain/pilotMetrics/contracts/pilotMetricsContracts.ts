import type { ContentDigest, HarnessError, Result } from "#common/index.js";
import type { ActorRef } from "#common/types/index.js";
import type { ActionId } from "#domain/actionJournal/index.js";
import type { CodingTaskId } from "#domain/codingTask/index.js";
import type { CodingTaskSessionId } from "#domain/codingTaskSession/index.js";
import type { RepositoryId, WorkspaceId } from "#domain/workspace/index.js";

import type {
  PilotAttestation,
  PilotEnrollmentSchemaVersion,
  PilotExecutionMode,
  PilotHumanTouchCategory,
  PilotHumanTouchSource,
  PilotQualityFactKind,
  PilotRiskLevel,
  PilotStepOutcome,
  PilotStepPhase,
  PilotSettlementSchemaVersion,
  PilotTaskClass,
} from "../enums/index.js";

/** Pilot Metrics 领域摘要计算所需的最小端口。 */
export interface PilotMetricsDigestPort {
  /** 对 JSON 兼容内容计算 RFC 8785 Content Digest。 */
  calculate(input: unknown): Result<ContentDigest, HarnessError>;
}

/** Enrollment 中预声明的单个步骤。 */
export interface PilotPlannedStep {
  /** 跨重试和重放保持稳定且在本记录内唯一的步骤 ID。 */
  readonly stepId: string;
  /** 步骤执行阶段。 */
  readonly phase: PilotStepPhase;
  /** 是否为必须执行的步骤。 */
  readonly required: boolean;
  /** 预期执行方式。 */
  readonly expectedExecutionMode: PilotExecutionMode;
}

/** 不含 recordDigest 的 Enrollment 输入。 */
export interface PilotEnrollmentInput {
  /** 所属 Pilot 的稳定标识。 */
  readonly pilotId: string;
  /** 纳入试点的工作区标识。 */
  readonly workspaceId: WorkspaceId;
  /** 本次度量对应的编码任务会话标识。 */
  readonly sessionId: CodingTaskSessionId;
  /** 本次度量对应的编码任务标识。 */
  readonly codingTaskId: CodingTaskId;
  /** 执行任务的仓库标识。 */
  readonly repositoryId: RepositoryId;
  /** 预登记的任务分类。 */
  readonly taskClass: PilotTaskClass;
  /** 预登记的任务风险等级。 */
  readonly riskLevel: PilotRiskLevel;
  /** 是否涉及历史业务逻辑变更。 */
  readonly historicalLogicChange: boolean;
  /** 计划写入的路径数量。 */
  readonly plannedWritePathCount: number;
  /** 计划要求通过的验证器数量。 */
  readonly requiredValidatorCount: number;
  /** 登记时的仓库修订版本。 */
  readonly repositoryRevision: string;
  /** 登记时使用的 Harness 修订版本。 */
  readonly harnessRevision: string;
  /** 登记时适用策略的内容摘要。 */
  readonly policyDigest: ContentDigest;
  /** 登记时声明的执行步骤。 */
  readonly plannedSteps: readonly PilotPlannedStep[];
  /** 完成登记的 UTC 时间。 */
  readonly enrolledAt: string;
  /** 执行登记的主体。 */
  readonly actor: ActorRef;
}

/** 不可变 Enrollment 领域记录。 */
export interface PilotEnrollment extends PilotEnrollmentInput {
  /** Enrollment 的固定 schema 版本。 */
  readonly schemaVersion: PilotEnrollmentSchemaVersion;
  /** 对除 recordDigest 外全部规范字段计算的摘要。 */
  readonly recordDigest: ContentDigest;
}

/** Human Touch 的原始半开时间区间。 */
export interface PilotHumanTouchEntry {
  /** 本记录内唯一的区间标识。 */
  readonly entryId: string;
  /** 人工介入的活动类别。 */
  readonly category: PilotHumanTouchCategory;
  /** 区间事实的采集来源。 */
  readonly source: PilotHumanTouchSource;
  /** 区间开始的 UTC 时间。 */
  readonly startedAt: string;
  /** 区间结束的 UTC 时间。 */
  readonly completedAt: string;
  /** 区间时长，单位为毫秒。 */
  readonly durationMs: number;
}

/** 单个已声明步骤的实际执行事实。 */
export interface PilotStepFact {
  /** 对应预登记步骤的标识。 */
  readonly stepId: string;
  /** 步骤实际采用的执行方式。 */
  readonly actualExecutionMode: PilotExecutionMode;
  /** 步骤执行结果。 */
  readonly outcome: PilotStepOutcome;
  /** 步骤的实际尝试次数。 */
  readonly attemptCount: number;
  /** 支撑执行事实的证据摘要。 */
  readonly evidenceDigests: readonly ContentDigest[];
}

/** 由 Human 显式确认的质量事实。 */
export interface PilotQualityFact {
  /** 本记录内唯一的质量事实标识。 */
  readonly factId: string;
  /** 质量事实的封闭类别。 */
  readonly kind: PilotQualityFactKind;
  /** 可选的关联步骤标识。 */
  readonly stepId?: string;
  /** 支撑质量事实的证据摘要。 */
  readonly evidenceDigest: ContentDigest;
}

/** 不含 recordDigest 的 Settlement 输入。 */
export interface PilotSettlementInput {
  /** 与 Enrollment 一致的 Pilot 标识。 */
  readonly pilotId: string;
  /** 结算记录所属的工作区标识。 */
  readonly workspaceId: WorkspaceId;
  /** 结算记录对应的编码任务会话标识。 */
  readonly sessionId: CodingTaskSessionId;
  /** 结算记录对应的编码任务标识。 */
  readonly codingTaskId: CodingTaskId;
  /** 完成任务的仓库标识。 */
  readonly repositoryId: RepositoryId;
  /** 对应 Enrollment 记录的内容摘要。 */
  readonly enrollmentDigest: ContentDigest;
  /** 产生结算事实的验证运行标识。 */
  readonly verificationRunId: string;
  /** 产生该验证证据的 Action Journal 标识。 */
  readonly verificationActionId: ActionId;
  /** 已采集的人工介入区间。 */
  readonly humanTouchEntries: readonly PilotHumanTouchEntry[];
  /** 已采集的步骤执行事实。 */
  readonly stepFacts: readonly PilotStepFact[];
  /** 经 Human 确认的质量事实。 */
  readonly qualityFacts: readonly PilotQualityFact[];
  /** Human 对记录完整性的声明。 */
  readonly attestation: PilotAttestation;
  /** 完成结算的 UTC 时间。 */
  readonly settledAt: string;
  /** 执行结算的主体。 */
  readonly actor: ActorRef;
}

/** 不可变 Settlement 领域记录。 */
export interface PilotSettlement extends PilotSettlementInput {
  /** Settlement 的固定 schema 版本。 */
  readonly schemaVersion: PilotSettlementSchemaVersion;
  /** 对除 recordDigest 外全部规范字段计算的摘要。 */
  readonly recordDigest: ContentDigest;
}
