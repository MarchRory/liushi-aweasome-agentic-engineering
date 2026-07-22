import type {
  CodingTaskCommand,
  CodingTaskCommandType,
  CreateCodingTaskPayload,
} from "#application/codingTask/index.js";
import type { CommandEnvelope, CommandReceipt } from "#application/command/index.js";
import type { CodingTaskSessionActivationDisposition } from "#application/ports/index.js";
import type {
  ProvisionWorktreeCommandPayload,
  ProvisionWorktreeRuntimeContext,
} from "#application/worktreeProvisioning/index.js";
import type { ContentDigest } from "#common/index.js";
import type { CodingTaskId } from "#domain/codingTask/index.js";
import type {
  CodingTaskSessionActivationRecord,
  CodingTaskSessionId,
} from "#domain/codingTaskSession/index.js";
import type { WorkspaceId } from "#domain/workspace/index.js";

import type {
  CODING_TASK_SESSION_ACTIVATION_MANIFEST_SCHEMA_VERSION,
  CODING_TASK_SESSION_ACTIVATION_REPORT_SCHEMA_VERSION,
} from "../constants/index.js";
import type {
  CodingTaskSessionActivationStage,
  CodingTaskSessionActivationStatus,
} from "../enums/index.js";

/** Worktree Provision 命令及其非持久化运行时输入。 */
export interface CodingTaskSessionProvisionStep {
  /** 经过规范信封校验的 Provision 命令。 */
  readonly command: CommandEnvelope<ProvisionWorktreeCommandPayload>;
  /** 只在当前进程存在的 Repository Root。 */
  readonly runtime: ProvisionWorktreeRuntimeContext;
}

/** 外部 Agent Session Activation 的最小输入协议。 */
export interface CodingTaskSessionActivationManifest {
  /** Activation Manifest 的固定 Schema 版本。 */
  readonly schemaVersion: typeof CODING_TASK_SESSION_ACTIVATION_MANIFEST_SCHEMA_VERSION;
  /** 本次外部 Agent Session 的稳定 ULID。 */
  readonly sessionId: CodingTaskSessionId;
  /** 创建 CodingTask 的版本化命令。 */
  readonly createCommand: CodingTaskCommand<CodingTaskCommandType.Create>;
  /** 受管 Worktree Provision 步骤。 */
  readonly provision: CodingTaskSessionProvisionStep;
  /** 启动当前 Attempt 的版本化命令。 */
  readonly startAttemptCommand: CodingTaskCommand<CodingTaskCommandType.StartAttempt>;
}

/** CLI 或嵌入式调用在启动期提供的单仓绑定。 */
export interface CodingTaskSessionRuntimeBinding {
  /** Harness 工作区 ID。 */
  readonly workspaceId: string;
  /** 本次 Activation 声明的 Repository ID；S1 不授予写入权限。 */
  readonly repositoryId: string;
  /** Repository 规范绝对根目录。 */
  readonly repositoryRoot: string;
  /** 启动器注入的 Agent 审计身份，不提供认证或业务授权。 */
  readonly agentActorId: string;
}

/** 完成所有副作用前校验后得到的运行时上下文。 */
export interface PreparedCodingTaskSessionActivation {
  /** 已严格解析的 Activation Manifest。 */
  readonly manifest: CodingTaskSessionActivationManifest;
  /** 经过严格校验的 Create Payload。 */
  readonly createPayload: CreateCodingTaskPayload;
  /** 从 Command Aggregate ID 解析的 CodingTask ID。 */
  readonly codingTaskId: CodingTaskId;
  /** 从 Create Payload 解析的 Harness 工作区 ID。 */
  readonly workspaceId: WorkspaceId;
  /** 从启动期 Repository Root 推导的唯一 Worktree Root。 */
  readonly worktreeRoot: string;
  /** 不暴露 Worktree Root 明文的内容摘要。 */
  readonly worktreeRootDigest: ContentDigest;
  /** StartAttempt 命令声明的 Attempt 序号。 */
  readonly attemptNumber: number;
  /** 由启动期绑定注入并与全部命令 Actor 复验的审计身份。 */
  readonly agentActorId: string;
}

/** Activation 中一个已执行命令的稳定阶段回执。 */
export interface CodingTaskSessionActivationStageReceipt {
  /** 回执所属的 Activation 阶段。 */
  readonly stage: CodingTaskSessionActivationStage;
  /** Application Command Gateway 返回的稳定回执。 */
  readonly receipt: CommandReceipt;
}

/** Session Activation 的可序列化结果。 */
export interface CodingTaskSessionActivationReport {
  /** Activation Report 的固定 Schema 版本。 */
  readonly schemaVersion: typeof CODING_TASK_SESSION_ACTIVATION_REPORT_SCHEMA_VERSION;
  /** Activation 的封闭结果。 */
  readonly status: CodingTaskSessionActivationStatus;
  /** 已经取得的命令阶段回执。 */
  readonly receipts: readonly CodingTaskSessionActivationStageReceipt[];
  /** 阻断或结果未知时停止的阶段。 */
  readonly stoppedStage?: CodingTaskSessionActivationStage;
  /** 等待 Agent 时可供本机启动器使用的 Worktree Root。 */
  readonly worktreeRoot?: string;
  /** 已领域重建的不可变 Activation Record。 */
  readonly activation?: CodingTaskSessionActivationRecord;
  /** Activation Record 的原子持久化结果。 */
  readonly persistenceDisposition?: CodingTaskSessionActivationDisposition;
}
