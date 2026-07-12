import type { HookExecutorKind } from "#application/index.js";
import type { HarnessErrorCode } from "#common/index.js";

/** CLI 支持的规范命令标识。 */
export enum CliCommand {
  /** 尚未成功解析命令。 */
  Unknown = "unknown",
  /** 显示 CLI 使用方式。 */
  Help = "help",
  /** 检查 Runtime Store。 */
  Doctor = "doctor",
  /** 创建 Task。 */
  TaskCreate = "task.create",
  /** 查询 Task 状态。 */
  TaskStatus = "task.status",
  /** 提交一个经过 Schema 与 Gate 校验的 Artifact。 */
  ArtifactPropose = "artifact.propose",
  /** 对精确 DecisionRequest 记录 Human 决策。 */
  ApprovalDecide = "approval.decide",
  /** 只读解析 Project Rule Catalog。 */
  RulesResolve = "rules.resolve",
  /** 对显式多仓执行只读 Project Discovery。 */
  ProjectScan = "project.scan",
  /** 将已批准的 ProjectProfileProposal 编译为完整 Bundle。 */
  ProfileCompile = "profile.compile",
  /** 将人工确认的 Task/PlanRisk 绑定到执行器工作区。 */
  HookBind = "hook.bind",
  /** 处理执行器通过 Stdin 传入的一次 Hook。 */
  HookHandle = "hook.handle",
  /** 输出供 Human 审阅后写入的 Codex hooks.json 投影。 */
  HookConfig = "hook.config",
  /** 只读探测 Codex 执行器能力。 */
  HookProbe = "hook.probe",
}

/** CLI 接受的 Human Approval 决策值。 */
export enum CliApprovalDecision {
  /** Human 批准当前精确 Digest。 */
  Approved = "approved",
  /** Human 拒绝当前精确 Digest。 */
  Rejected = "rejected",
  /** Human 请求豁免；不可豁免 Gate 将由 Core 拒绝。 */
  Waived = "waived",
}

/** CLI 输出面向 Human 或稳定 JSON Consumer。 */
export enum CliOutputFormat {
  /** 输出简洁 Human 文本。 */
  Human = "human",
  /** 输出带 Schema Version 的单行 JSON。 */
  Json = "json",
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

/** 所有已解析命令共享的输出和 Store 选项。 */
interface BaseCliCommand {
  /** 当前输出格式。 */
  outputFormat: CliOutputFormat;
  /** 可选 Runtime Store 覆盖路径。 */
  storeRoot?: string;
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
  | HookBindCliCommand
  | HookHandleCliCommand
  | HookConfigCliCommand
  | HookProbeCliCommand;

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
