import type { HookExecutorKind } from "#application/index.js";
import type { HarnessErrorCode } from "#common/index.js";

import type { CliVerificationMode } from "../enums/index.js";
import type { BaseCliCommand, CliCommand } from "./cliCommandContracts.js";
import type {
  ExecutorCompatibilityBundleCreateCliCommand,
  ExecutorCompatibilityCompileCliCommand,
  ExecutorCompatibilityQueryCliCommand,
} from "./cliExecutorCompatibilityContracts.js";
import type { InitApplyCliCommand, InitDryRunCliCommand } from "./cliInstallationContracts.js";

/** CLI 接受的 Human Approval 决策值。 */
export enum CliApprovalDecision {
  /** Human 批准当前精确 Digest。 */
  Approved = "approved",
  /** Human 拒绝当前精确 Digest。 */
  Rejected = "rejected",
  /** Human 请求豁免；不可豁免 Gate 将由 Core 拒绝。 */
  Waived = "waived",
}

/** CLI JSON Envelope 的结果类别。 */
export enum CliResponseStatus {
  /** 命令成功。 */
  Success = "success",
  /** 命令完成解析但结果禁止继续执行。 */
  Blocked = "blocked",
  /** 命令失败。 */
  Failure = "failure",
}

/** Help 命令。 */
export interface HelpCliCommand extends BaseCliCommand {
  /** 规范命令标识。 */
  command: CliCommand.Help;
}
/** Doctor 命令。 */
export interface DoctorCliCommand extends BaseCliCommand {
  /** 规范命令标识。 */
  command: CliCommand.Doctor;
}
/** Task Create 命令。 */
export interface TaskCreateCliCommand extends BaseCliCommand {
  /** 规范命令标识。 */
  command: CliCommand.TaskCreate;
  /** Task 所属 Workspace。 */
  workspaceId: string;
  /** 可选外部来源。 */
  source?: string;
  /** 创建 Task 的本地 Human ID。 */
  actorId: string;
}
/** Task Status 命令。 */
export interface TaskStatusCliCommand extends BaseCliCommand {
  /** 规范命令标识。 */
  command: CliCommand.TaskStatus;
  /** Task 所属 Workspace。 */
  workspaceId: string;
  /** Task ULID 标识。 */
  taskId: string;
}

/** Artifact Propose 命令。 */
export interface ArtifactProposeCliCommand extends BaseCliCommand {
  /** 规范命令标识。 */
  command: CliCommand.ArtifactPropose;
  /** Task 所属 Workspace。 */
  workspaceId: string;
  /** Task ULID 标识。 */
  taskId: string;
  /** Artifact Proposal JSON 文件路径。 */
  filePath: string;
  /** 提交 Artifact 的本地 Human ID。 */
  actorId: string;
}

/** Approval Decide 命令。 */
export interface ApprovalDecideCliCommand extends BaseCliCommand {
  /** 规范命令标识。 */
  command: CliCommand.ApprovalDecide;
  /** Task 所属 Workspace。 */
  workspaceId: string;
  /** Task ULID 标识。 */
  taskId: string;
  /** 正在响应的 DecisionRequest ID。 */
  decisionRequestId: string;
  /** Human 已审阅的 DecisionRequest Digest。 */
  decisionRequestDigest: string;
  /** Human 的封闭决策结果。 */
  decision: CliApprovalDecision;
  /** 调用方提供的稳定幂等键。 */
  idempotencyKey: string;
  /** 作出决策的本地 Human ID。 */
  actorId: string;
  /** 拒绝或豁免时的决策原因。 */
  reason?: string;
}

/** Rules Resolve 命令。 */
export interface RulesResolveCliCommand extends BaseCliCommand {
  /** 规范命令标识。 */
  command: CliCommand.RulesResolve;
  /** Project Rule Catalog JSON 文件路径。 */
  catalogFilePath: string;
  /** Rule Resolution Context JSON 文件路径。 */
  contextFilePath: string;
}

/** Project Scan 命令。 */
export interface ProjectScanCliCommand extends BaseCliCommand {
  /** 规范命令标识。 */
  command: CliCommand.ProjectScan;
  /** Project Scan Manifest JSON 文件路径。 */
  filePath: string;
}

/** Profile Compile 命令。 */
export interface ProfileCompileCliCommand extends BaseCliCommand {
  /** 规范命令标识。 */
  command: CliCommand.ProfileCompile;
  /** Task 所属 Workspace。 */
  workspaceId: string;
  /** Task ULID 标识。 */
  taskId: string;
  /** 已批准的 ProjectProfileProposal Artifact ULID。 */
  artifactId: string;
  /** 当前 Project Discovery Report JSON 文件路径。 */
  reportFilePath: string;
}

/** CodingTask Cell Run 命令。 */
export interface CellRunCliCommand extends BaseCliCommand {
  /** 规范命令标识。 */
  command: CliCommand.CellRun;
  /** CodingTask Cell Manifest JSON 文件路径。 */
  filePath: string;
  /** 可信 CLI Workspace 绑定。 */
  workspaceId: string;
  /** 可信 CLI Repository 绑定。 */
  repositoryId: string;
  /** 可信 CLI Repository 绝对根目录。 */
  repositoryRoot: string;
  /** 显式 Verification 执行模式。 */
  verificationMode: CliVerificationMode;
}

/** Hook Workspace Binding 命令。 */
export interface HookBindCliCommand extends BaseCliCommand {
  /** 规范命令标识。 */
  command: CliCommand.HookBind;
  /** 仓库或公共层绝对根目录。 */
  workspaceRoot: string;
  /** Harness Workspace 标识。 */
  workspaceId: string;
  /** 绑定的 Task 标识。 */
  taskId: string;
  /** 精确 PlanRisk Artifact 标识。 */
  artifactId: string;
  /** 精确 PlanRisk Artifact Digest。 */
  artifactDigest: string;
  /** 允许执行文件动作的 Actor ID。 */
  actorId: string;
}

/** Codex Hook Handle 命令。 */
export interface HookHandleCliCommand extends BaseCliCommand {
  /** 规范命令标识。 */
  command: CliCommand.HookHandle;
  /** 当前支持的执行器。 */
  executor: HookExecutorKind;
}

/** Codex Hook 配置投影命令。 */
export interface HookConfigCliCommand extends BaseCliCommand {
  /** 规范命令标识。 */
  command: CliCommand.HookConfig;
  /** 当前支持的执行器。 */
  executor: HookExecutorKind;
}

/** Codex Hook 能力探测命令。 */
export interface HookProbeCliCommand extends BaseCliCommand {
  /** 规范命令标识。 */
  command: CliCommand.HookProbe;
  /** 当前支持的执行器。 */
  executor: HookExecutorKind;
  /** 实际交给 Node spawn 的可执行文件或命令名。 */
  executable: string;
}

/** CLI Parser 成功后允许进入执行阶段的命令。 */
export type ParsedCliCommand =
  | HelpCliCommand
  | DoctorCliCommand
  | TaskCreateCliCommand
  | TaskStatusCliCommand
  | ArtifactProposeCliCommand
  | ApprovalDecideCliCommand
  | RulesResolveCliCommand
  | ProjectScanCliCommand
  | ProfileCompileCliCommand
  | CellRunCliCommand
  | HookBindCliCommand
  | HookHandleCliCommand
  | HookConfigCliCommand
  | HookProbeCliCommand
  | InitDryRunCliCommand
  | InitApplyCliCommand
  | ExecutorCompatibilityCompileCliCommand
  | ExecutorCompatibilityQueryCliCommand
  | ExecutorCompatibilityBundleCreateCliCommand;

/** CLI JSON 失败信息。 */
export interface CliErrorPayload {
  /** 稳定 Harness Error Code。 */
  code: HarnessErrorCode;
  /** 面向 Human 的错误摘要。 */
  message: string;
  /** 不包含 Secret 的诊断字段。 */
  details: Readonly<Record<string, string>>;
}
/** CLI JSON 成功 Envelope。 */
export interface CliSuccessEnvelope<T> {
  /** CLI 输出 Schema Version。 */
  schemaVersion: string;
  /** 成功判别字段。 */
  status: CliResponseStatus.Success;
  /** 已执行的规范命令。 */
  command: CliCommand;
  /** 命令结果。 */
  data: T;
}
/** CLI JSON 阻断 Envelope。 */
export interface CliBlockedEnvelope<T> {
  /** CLI 输出 Schema Version。 */
  schemaVersion: string;
  /** 阻断判别字段。 */
  status: CliResponseStatus.Blocked;
  /** 已执行的规范命令。 */
  command: CliCommand;
  /** 已成功生成但禁止执行的领域结果。 */
  data: T;
}
/** CLI JSON 失败 Envelope。 */
export interface CliFailureEnvelope {
  /** CLI 输出 Schema Version。 */
  schemaVersion: string;
  /** 失败判别字段。 */
  status: CliResponseStatus.Failure;
  /** 失败发生时已知的规范命令。 */
  command: CliCommand;
  /** 稳定结构化错误。 */
  error: CliErrorPayload;
}
