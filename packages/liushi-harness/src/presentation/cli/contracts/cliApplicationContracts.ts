import type {
  BindHookWorkspaceUseCase,
  CodingTaskCellService,
  CheckRuntimeHealthUseCase,
  CodexHookHandler,
  CompileProjectProfileUseCase,
  CreateTaskUseCase,
  GetTaskStatusUseCase,
  ProposeArtifactUseCase,
  ProbeCodexCapabilitiesUseCase,
  RecordApprovalUseCase,
  ResolveRulesUseCase,
  ScanProjectUseCase,
  CreateInstallPlanUseCase,
} from "#application/index.js";

import type { HookInputReader, JsonDocumentReader } from "../input/index.js";
import type { CliVerificationMode } from "../enums/index.js";

/** CLI 启动期可信 Repository 绑定。 */
export interface CliRepositoryBinding {
  /** Harness Workspace 标识。 */
  readonly workspaceId: string;
  /** 单一写入 Repository 标识。 */
  readonly repositoryId: string;
  /** Repository 规范绝对根目录。 */
  readonly repositoryRoot: string;
}

/** 一次 CLI Application 创建所需的可选启动配置。 */
export interface CliApplicationStartupConfig {
  /** Cell 命令使用的可信单仓绑定。 */
  readonly repositoryBinding: CliRepositoryBinding;
  /** Cell 命令显式选择的 Verification 模式。 */
  readonly verificationMode: CliVerificationMode;
}

/** 生成只读、可序列化的执行器配置投影。 */
export interface HookConfigProjector {
  /** 生成不修改文件的配置对象。 */
  project(): Readonly<Record<string, unknown>>;
}

/** CLI 可调用的 Application Use Cases。 */
export interface CliApplication {
  /** G0 托管文件 dry-run InstallPlan Use Case。 */
  createInstallPlan: CreateInstallPlanUseCase;
  /** 串行 CodingTask Cell。 */
  runCodingTaskCell: CodingTaskCellService;
  /** Runtime 健康检查 Use Case。 */
  checkRuntimeHealth: CheckRuntimeHealthUseCase;
  /** Project Profile 编译 Use Case。 */
  compileProjectProfile: CompileProjectProfileUseCase;
  /** Codex Hook 工作区绑定 Use Case。 */
  bindHookWorkspace: BindHookWorkspaceUseCase;
  /** Codex Hook 平台处理器。 */
  handleCodexHook: CodexHookHandler;
  /** Codex 执行器只读能力探测。 */
  probeCodexCapabilities: ProbeCodexCapabilitiesUseCase;
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
  create(storeRoot: string, startupConfig?: CliApplicationStartupConfig): CliApplication;
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
  /** Hook Handle 使用的 Stdin 读取边界。 */
  hookInputReader?: HookInputReader;
  /** Hook Config 使用的只读配置投影器。 */
  hookConfigProjector?: HookConfigProjector;
}
