import type {
  AuthorizationContext,
  CommandInvocationProvenance,
  CommandReceipt,
} from "#application/command/index.js";
import type { CodingTaskSessionDeliverySubmissionCommand } from "#application/codingTaskSessionDelivery/index.js";
import type { VerificationPlanSelectionResult } from "#application/useCases/selectVerificationPlan/index.js";
import type { VerificationCommandRuntimeContext } from "#application/verificationCommand/index.js";
import type { ActorRef } from "#common/index.js";
import type { ProjectDiscoveryReport } from "#domain/projectDiscovery/index.js";
import type { PrReadyArtifact } from "#domain/repositoryDelivery/index.js";
import type { RuleResolutionContext } from "#domain/rule/index.js";
import type { EvidenceBundle } from "#domain/verification/index.js";
import type { FailureTaxonomy } from "#domain/workflow/index.js";

import type { CODING_TASK_DELIVERY_COMPLETION_REPORT_SCHEMA_VERSION } from "../constants/index.js";
import type {
  CodingTaskDeliveryCompletionStage,
  CodingTaskDeliveryCompletionStatus,
} from "../enums/index.js";

/** 从权威 Task Store 重新编译 Project Profile 的稳定定位输入。 */
export interface CodingTaskDeliveryProfileCompilationInput {
  /** 保存已批准 G8 ProjectProfileProposal 的 Task；项目级 Profile 可跨业务 Task 复用。 */
  readonly taskId: string;
  /** 已批准 ProjectProfileProposal Artifact 的稳定标识。 */
  readonly artifactId: string;
  /** 当前 Project Discovery Report；Use Case 会严格解析并复验摘要。 */
  readonly report: ProjectDiscoveryReport;
}

/** 构造 Verification Command 所需的调用元数据。 */
export interface CodingTaskDeliveryVerificationInput {
  /** Verification Command 稳定标识。 */
  readonly commandId: string;
  /** Verification Command 的稳定幂等键。 */
  readonly idempotencyKey: string;
  /** Action Journal 使用的稳定 Action ID。 */
  readonly actionId: string;
  /** Evidence Store 使用的稳定 Verification Run ID。 */
  readonly verificationRunId: string;
  /** 权威选择生成的 Verification Plan ID。 */
  readonly planId: string;
  /** 发起 Verification 的 Actor 声明。 */
  readonly actor: ActorRef;
  /** 外部身份边界提供的授权上下文。 */
  readonly authorizationContext: AuthorizationContext;
  /** 可选的 Executor 调用来源证明。 */
  readonly invocationProvenance?: CommandInvocationProvenance;
  /** Verification Command 的提交时间。 */
  readonly submittedAt: string;
  /** 明确失败时使用的业务失败分类。 */
  readonly failedVerificationTaxonomy: FailureTaxonomy;
  /** 仅在当前进程使用的受信 Worktree Runtime。 */
  readonly runtime: VerificationCommandRuntimeContext;
}

/** Session Delivery 到 PR-ready 的完整无状态输入。 */
export interface CodingTaskDeliveryCompletionInput {
  /** 交给既有 Delivery Submission Service 的完整命令。 */
  readonly deliveryCommand: CodingTaskSessionDeliverySubmissionCommand;
  /** 从已批准 G8 Artifact 重新编译 Profile 的输入。 */
  readonly profileCompilation: CodingTaskDeliveryProfileCompilationInput;
  /** 待由 ResolveRulesUseCase 严格解析的当前需求上下文。 */
  readonly ruleResolutionContext: RuleResolutionContext;
  /** 由 Harness 物化最终 Command 的 Verification 元数据。 */
  readonly verification: CodingTaskDeliveryVerificationInput;
}

/** Session Delivery、Verification 与 PR-ready 的统一执行报告。 */
export interface CodingTaskDeliveryCompletionReport {
  /** Report 的稳定 Schema 版本。 */
  readonly schemaVersion: typeof CODING_TASK_DELIVERY_COMPLETION_REPORT_SCHEMA_VERSION;
  /** 当前交付链的封闭业务状态。 */
  readonly status: CodingTaskDeliveryCompletionStatus;
  /** 未进入 ReviewReady 时停止的阶段。 */
  readonly stoppedStage?: CodingTaskDeliveryCompletionStage;
  /** Delivery Submission 的权威 Command Receipt。 */
  readonly deliveryReceipt: CommandReceipt;
  /** 已执行 Verification Command 时的权威 Receipt。 */
  readonly verificationReceipt?: CommandReceipt;
  /** 已完成影响面计算时的权威 Plan 选择结果。 */
  readonly planSelection?: VerificationPlanSelectionResult;
  /** Verification 已形成稳定结果时的 EvidenceBundle。 */
  readonly evidenceBundle?: EvidenceBundle;
  /** 仅 ReviewReady 状态存在的 PR-ready Artifact。 */
  readonly prReadyArtifact?: PrReadyArtifact;
}
