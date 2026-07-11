import type {
  CheckRuntimeHealthUseCase,
  CreateTaskUseCase,
  GetTaskStatusUseCase,
  ProposeArtifactUseCase,
  RecordApprovalUseCase,
  ResolveRulesUseCase,
  ScanProjectUseCase,
} from "#application/index.js";
import type { HarnessErrorCode } from "#common/index.js";

import type { JsonDocumentReader } from "../input/index.js";

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
  /** Task ULID。 */
  taskId: string;
}

/** Artifact Propose 命令。 */
export interface ArtifactProposeCliCommand extends BaseCliCommand {
  /** 规范命令标识。 */
  command: CliCommand.ArtifactPropose;
  /** Task 所属 Workspace。 */
  workspaceId: string;
  /** Task ULID。 */
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
  /** Task ULID。 */
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

/** CLI Parser 成功后允许进入执行阶段的命令。 */
export type ParsedCliCommand =
  | HelpCliCommand
  | DoctorCliCommand
  | TaskCreateCliCommand
  | TaskStatusCliCommand
  | ArtifactProposeCliCommand
  | ApprovalDecideCliCommand
  | RulesResolveCliCommand
  | ProjectScanCliCommand;

/** CLI 可调用的 Application Use Cases。 */
export interface CliApplication {
  /** Runtime 健康检查 Use Case。 */
  checkRuntimeHealth: CheckRuntimeHealthUseCase;
  /** Task 创建 Use Case。 */
  createTask: CreateTaskUseCase;
  /** Task 状态查询 Use Case。 */
  getTaskStatus: GetTaskStatusUseCase;
  /** Artifact 提交 Use Case。 */
  proposeArtifact: ProposeArtifactUseCase;
  /** Human Approval 记录 Use Case。 */
  recordApproval: RecordApprovalUseCase;
  /** 确定性 Rule Resolution Use Case。 */
  resolveRules: ResolveRulesUseCase;
  /** 显式多仓只读 Project Discovery Use Case。 */
  scanProject: ScanProjectUseCase;
}
/** 按 Store Root 创建 Use Cases 的工厂。 */
export interface CliApplicationFactory {
  /** 为一次命令创建无全局可变状态的 Application。 */
  create(storeRoot: string): CliApplication;
}
/** CLI 标准输出和错误输出边界。 */
export interface CliWriter {
  /** 写入标准输出。 */
  stdout(value: string): void;
  /** 写入标准错误。 */
  stderr(value: string): void;
}
/** 运行 CLI 所需的外部依赖。 */
export interface RunCliDependencies {
  /** 没有 `--store` 时使用的 Runtime Store。 */
  defaultStoreRoot: string;
  /** 唯一 Composition Root 提供的 Application Factory。 */
  applicationFactory: CliApplicationFactory;
  /** 可替换的输出边界。 */
  writer: CliWriter;
  /** 受大小限制的 JSON 文档读取边界。 */
  jsonDocumentReader: JsonDocumentReader;
}

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
