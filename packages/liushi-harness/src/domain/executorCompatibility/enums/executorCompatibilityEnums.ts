/** Harness 提供的执行器 Adapter 协议。 */
export enum ExecutorAdapterKind {
  /** 面向 OpenAI Codex 的原生适配协议。 */
  Codex = "codex",
  /** 面向 Claude Code 协议的兼容适配协议。 */
  ClaudeCompatible = "claude_compatible",
  /** 只承诺通用命令行能力的 Adapter。 */
  GenericCli = "generic_cli",
}

/** 接受实测并形成支持声明的实际执行器发行版。 */
export enum ExecutorDistribution {
  /** OpenAI 提供的 Codex 命令行产品。 */
  CodexCli = "codex_cli",
  /** Anthropic 提供的 Claude Code 产品。 */
  ClaudeCode = "claude_code",
  /** 企业内部兼容 Claude 协议的 CatPaw 产品。 */
  CatPaw = "catpaw",
  /** 未提供平台增强能力的通用 CLI。 */
  GenericCli = "generic_cli",
}

/** 执行器动态验收所在的 Host Surface。 */
export enum ExecutorHostSurface {
  /** Human 参与的交互式终端界面。 */
  InteractiveTui = "interactive_tui",
  /** 无交互命令行调用。 */
  NonInteractiveCli = "non_interactive_cli",
  /** 桌面应用宿主。 */
  Desktop = "desktop",
  /** IDE 扩展宿主。 */
  Ide = "ide",
  /** 可编程 App Server 宿主。 */
  AppServer = "app_server",
}

/** Host 操作系统。 */
export enum ExecutorOperatingSystem {
  /** 微软 Windows 操作系统。 */
  Windows = "windows",
  /** Linux 操作系统。 */
  Linux = "linux",
  /** 苹果 macOS 操作系统。 */
  MacOS = "macos",
}

/** Host 处理器架构。 */
export enum ExecutorArchitecture {
  /** x86-64 处理器架构。 */
  X64 = "x64",
  /** ARM64 处理器架构。 */
  Arm64 = "arm64",
}

/** Harness 归一化后的执行器权限范围。 */
export enum ExecutorPermissionMode {
  /** 只读工作区。 */
  ReadOnly = "read_only",
  /** 仅允许写入批准的工作区。 */
  WorkspaceWrite = "workspace_write",
  /** 执行器不提供文件系统隔离。 */
  FullAccess = "full_access",
}

/** 平台 Adapter 向 Harness 证明的规范能力。 */
export enum ExecutorCapability {
  /** 平台可以运行确定性 Command Hook Handler。 */
  CommandHookHandler = "command_hook_handler",
  /** 文件变更前能够调用 Canonical PreAction。 */
  PreFileMutation = "pre_file_mutation",
  /** 文件变更后能够调用 Canonical PostAction。 */
  PostFileMutation = "post_file_mutation",
  /** 越权文件变更能够被关闭式拒绝。 */
  DenyFileMutation = "deny_file_mutation",
  /** Hook 可以通过原生 Stdin 接收结构化输入。 */
  NativeHookInput = "native_hook_input",
}

/** 限定能力覆盖范围的规范维度。 */
export enum ExecutorCapabilityQualifierKind {
  /** Harness 规范动作类别。 */
  CanonicalAction = "canonical_action",
  /** 实际执行器工具名称。 */
  NativeTool = "native_tool",
  /** 实际执行器生命周期事件。 */
  LifecycleEvent = "lifecycle_event",
}

/** 支撑执行器能力声明的证据等级。 */
export enum ExecutorEvidenceKind {
  /** 不启动模型的静态 CLI 探测。 */
  StaticProbe = "static_probe",
  /** Adapter 共享契约测试。 */
  ContractTest = "contract_test",
  /** 临时 Fixture 中的动态最小调用。 */
  SmokeTest = "smoke_test",
  /** 越权、错误输入或缺失审批的负向测试。 */
  NegativeTest = "negative_test",
  /** 精确 Host Scope 中的真实生产路径验收。 */
  ProductionE2e = "production_e2e",
}

/** 单份执行器能力证据的封闭结果。 */
export enum ExecutorEvidenceOutcome {
  /** 全部声明检查通过。 */
  Passed = "passed",
  /** 至少一项声明检查失败。 */
  Failed = "failed",
  /** 证据不足，不能得出通过或失败结论。 */
  Inconclusive = "inconclusive",
}

/** 能力证据原始 Artifact 的可复核位置类型。 */
export enum ExecutorEvidenceLocatorKind {
  /** 当前源码仓库内的相对路径。 */
  RepositoryPath = "repository_path",
  /** Harness Runtime Store 内的相对 Locator。 */
  RuntimeStore = "runtime_store",
  /** 受信任外部系统中的内容寻址 Artifact URN。 */
  ExternalUri = "external_uri",
}

/** 对外支持声明与内部未验证状态。 */
export enum ExecutorSupportLevel {
  /** 精确 Host Scope 已满足生产 Profile。 */
  Production = "production",
  /** 共享 Contract、Smoke 与 Negative Profile 已闭合。 */
  Compatible = "compatible",
  /** 只有部分正向证据，不能进入生产路径。 */
  Experimental = "experimental",
  /** 已有明确且无矛盾的失败证据。 */
  Unsupported = "unsupported",
  /** 没有足够证据形成支持声明。 */
  Unverified = "unverified",
}

/** 单项能力在矩阵中的支持状态。 */
export enum ExecutorCapabilitySupport {
  /** 对应 Policy 要求全部满足。 */
  Verified = "verified",
  /** 至少存在部分通过证据。 */
  Experimental = "experimental",
  /** 存在经过审计的替代路径。 */
  Degraded = "degraded",
  /** 存在明确且无矛盾的失败证据。 */
  Unsupported = "unsupported",
  /** 没有足够证据。 */
  Unverified = "unverified",
}

/** 单条 Policy Requirement 的评估结果。 */
export enum ExecutorRequirementStatus {
  /** 每个要求的证据等级都有通过记录。 */
  Satisfied = "satisfied",
  /** 至少一个证据等级缺少可判定的一致结果。 */
  Missing = "missing",
  /** 至少一个证据等级存在失败记录。 */
  Failed = "failed",
  /** 同一证据等级同时存在多个不同 Outcome。 */
  Conflicting = "conflicting",
}

/** 支持 Tier 可以要求 Host Scope 明确绑定的字段。 */
export enum ExecutorScopeField {
  /** 动态调用模型标识。 */
  ModelId = "model_id",
  /** 归一化权限范围。 */
  PermissionMode = "permission_mode",
  /** 平台配置投影摘要。 */
  ConfigurationDigest = "configuration_digest",
}
