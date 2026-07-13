import type { CommandEnvelope, CommandReceipt } from "#application/command/index.js";
import type { PrReadyArtifact } from "#domain/repositoryDelivery/index.js";
import type { EvidenceBundle } from "#domain/verification/index.js";

import type { CodingTaskCellStage, CodingTaskCellStatus } from "../enums/index.js";
import type {
  CodingTaskCellRevisionBinding,
  CodingTaskCellVerificationTemplatePayload,
} from "../verificationBinding/index.js";

/** CodingTask Cell Manifest 的严格版本。 */
export const CODING_TASK_CELL_MANIFEST_SCHEMA_VERSION = "coding-task.cell.run.v2";

/** CodingTask Cell Report 的稳定版本。 */
export const CODING_TASK_CELL_REPORT_SCHEMA_VERSION = "coding-task.cell.report.v1";

/** 携带 Repository Root 的命令步骤。 */
export interface CodingTaskCellRepositoryStep {
  /** 交给既有 Service 的完整 Command Envelope。 */
  readonly command: CommandEnvelope;
  /** 仅在本次调用中使用的 Runtime Binding。 */
  readonly runtime: {
    /** 本地 Repository Root。 */
    readonly repositoryRoot: string;
  };
}

/** 携带 Worktree Root 的 Verification 步骤。 */
export interface CodingTaskCellVerificationStep {
  /** 携带 Plan Template 的 Verification Command Envelope。 */
  readonly command: CommandEnvelope<CodingTaskCellVerificationTemplatePayload>;
  /** 从权威 CodingTask Aggregate 解析目标 Revision 的封闭策略。 */
  readonly binding: CodingTaskCellRevisionBinding;
  /** 仅在本次调用中使用的 Runtime Binding。 */
  readonly runtime: {
    /** 本地 Worktree Root。 */
    readonly worktreeRoot: string;
  };
}

/** 已完成结构与跨命令身份校验的 Cell Manifest。 */
export interface CodingTaskCellRunManifest {
  /** Manifest 严格版本。 */
  readonly schemaVersion: typeof CODING_TASK_CELL_MANIFEST_SCHEMA_VERSION;
  /** 创建 CodingTask 的命令。 */
  readonly createCommand: CommandEnvelope;
  /** 创建受管 Worktree 的步骤。 */
  readonly provision: CodingTaskCellRepositoryStep;
  /** 开始首个编码 Attempt 的命令。 */
  readonly startAttemptCommand: CommandEnvelope;
  /** 一个或多个顺序执行的文件实现步骤。 */
  readonly implementations: readonly CodingTaskCellRepositoryStep[];
  /** 创建 Checkpoint 并提交实现的步骤。 */
  readonly submission: CodingTaskCellRepositoryStep;
  /** 执行 Verification Plan 的步骤。 */
  readonly verification: CodingTaskCellVerificationStep;
}

/** 单个 Cell 阶段收集到的 Command Receipt。 */
export interface CodingTaskCellStageReceipt {
  /** Receipt 所属的封闭执行阶段。 */
  readonly stage: CodingTaskCellStage;
  /** 多实现步骤中的零基索引，仅 Implementation 阶段存在。 */
  readonly implementationIndex?: number;
  /** Application Command Gateway 返回的权威 Receipt。 */
  readonly receipt: CommandReceipt;
}

/** CodingTask Cell 的确定性执行报告。 */
export interface CodingTaskCellReport {
  /** Report 稳定版本。 */
  readonly schemaVersion: typeof CODING_TASK_CELL_REPORT_SCHEMA_VERSION;
  /** Cell 最终业务状态。 */
  readonly status: CodingTaskCellStatus;
  /** 阻断或结果未知时停止的阶段。 */
  readonly stoppedStage?: CodingTaskCellStage;
  /** 按执行顺序收集的 Receipt。 */
  readonly receipts: readonly CodingTaskCellStageReceipt[];
  /** Verification 完成后强一致读取的 EvidenceBundle。 */
  readonly evidenceBundle?: EvidenceBundle;
  /** 全部权威绑定闭合后生成的 PR-ready Repository Delivery Artifact。 */
  readonly prReadyArtifact?: PrReadyArtifact;
}
