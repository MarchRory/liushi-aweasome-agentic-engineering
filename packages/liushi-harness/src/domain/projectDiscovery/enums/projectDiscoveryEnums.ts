/** Repository 在 Workspace 中承担的候选责任。 */
export enum RepositoryRole {
  /** 承载最终用户或业务应用。 */
  Application = "application",
  /** 被多个 Application 复用的公共基础设施。 */
  SharedInfrastructure = "shared_infrastructure",
  /** 可独立构建和版本化的共享 Library。 */
  Library = "library",
  /** 承载 Schema、IDL 或生成协议。 */
  Contract = "contract",
  /** 承载团队文档、Runbook 或知识源。 */
  Documentation = "documentation",
  /** 当前证据不足，必须由 Human 分类。 */
  Unknown = "unknown",
}

/** Project Scanner 报告的完整性状态。 */
export enum ProjectDiscoveryStatus {
  /** 扫描完成且没有阻断性诊断。 */
  Complete = "complete",
  /** 扫描结束但存在安全或解析缺口。 */
  Incomplete = "incomplete",
}

/** Project Profile Candidate 进入 Promotion 前的人工门禁状态。 */
export enum ProjectProfilePromotionStatus {
  /** 当前 Scanner 只产出 Candidate，必须经过独立 Human Review。 */
  HumanReviewRequired = "human_review_required",
}

/** Project Scanner 诊断的严重程度。 */
export enum ProjectDiagnosticSeverity {
  /** 仅记录可解释事实。 */
  Info = "info",
  /** 需要 Human 注意但不代表扫描结果不完整。 */
  Warning = "warning",
  /** 禁止 Candidate 直接进入后续 Promotion。 */
  Blocking = "blocking",
}

/** Project Scanner 可以稳定报告的诊断代码。 */
export enum ProjectDiagnosticCode {
  /** 文件不是有效 UTF-8 文本。 */
  InvalidTextEncoding = "invalid_text_encoding",
  /** JSON、JSONC 或 YAML 配置无法严格解析。 */
  ConfigParseError = "config_parse_error",
  /** Symlink 或 Junction 按安全策略被跳过。 */
  SymbolicLinkSkipped = "symbolic_link_skipped",
  /** 当前平台下存在仅大小写不同的相对路径。 */
  CaseCollision = "case_collision",
  /** 目录或文件因权限或并发变化不可读取。 */
  PathUnreadable = "path_unreadable",
  /** Repository 同时出现多个 Package Manager Lockfile。 */
  MultiplePackageManagers = "multiple_package_managers",
  /** JS/CJS/MJS 配置仅记录存在，不会执行。 */
  ExecutableConfigNotEvaluated = "executable_config_not_evaluated",
  /** TypeScript 配置继承尚未在本切片解析。 */
  ConfigInheritanceUnresolved = "config_inheritance_unresolved",
}

/** Scanner 识别的配置文件类别。 */
export enum ProjectConfigKind {
  /** npm-compatible package manifest。 */
  PackageManifest = "package_manifest",
  /** TypeScript 或 JavaScript Compiler 配置。 */
  TypeScript = "typescript",
  /** ESLint 配置。 */
  Eslint = "eslint",
  /** Prettier 配置。 */
  Prettier = "prettier",
  /** Stylelint 配置。 */
  Stylelint = "stylelint",
  /** Unit、Integration 或 E2E Test 配置。 */
  Test = "test",
  /** Build、Bundler 或 Framework 配置。 */
  Build = "build",
  /** CI Workflow 配置。 */
  ContinuousIntegration = "continuous_integration",
  /** CODEOWNERS 文件。 */
  CodeOwners = "codeowners",
  /** Package Manager Workspace 配置。 */
  Workspace = "workspace",
  /** Package Manager Lockfile。 */
  Lockfile = "lockfile",
  /** Codex AGENTS.md 指导文件。 */
  CodexInstruction = "codex_instruction",
  /** Claude-compatible CLAUDE.md 指导文件。 */
  ClaudeInstruction = "claude_instruction",
  /** Harness 自身的显式项目配置。 */
  Harness = "harness",
  /** Dependency Cruiser 或同类架构检查配置。 */
  ArchitectureValidation = "architecture_validation",
}

/** 配置文件内容被 Scanner 处理的方式。 */
export enum ProjectConfigParseStatus {
  /** 内容已通过对应结构化 Parser。 */
  Parsed = "parsed",
  /** 出于安全原因只记录文件存在与 Digest。 */
  PresenceOnly = "presence_only",
  /** 内容无法通过结构化 Parser。 */
  Invalid = "invalid",
  /** 文件因安全、可读性或编码问题没有读取。 */
  Unavailable = "unavailable",
}

/** Scanner 从 Lockfile 或 packageManager 字段识别的工具。 */
export enum ProjectPackageManager {
  /** npm。 */
  Npm = "npm",
  /** pnpm。 */
  Pnpm = "pnpm",
  /** Yarn Classic 或 Berry。 */
  Yarn = "yarn",
  /** Bun。 */
  Bun = "bun",
}

/** Package 依赖声明的封闭类别。 */
export enum ProjectDependencyKind {
  /** 生产运行依赖。 */
  Runtime = "runtime",
  /** 开发和测试依赖。 */
  Development = "development",
  /** Peer 兼容契约。 */
  Peer = "peer",
  /** 可选运行依赖。 */
  Optional = "optional",
}

/** 结构扫描可以提出的架构机制候选类别。 */
export enum ProjectMechanismKind {
  /** 被多个模块或仓库复用的公共层。 */
  SharedLayer = "shared_layer",
  /** 业务或库源代码根目录。 */
  SourceRoot = "source_root",
  /** Test 与 Fixture 根目录。 */
  TestRoot = "test_root",
  /** API、Client 或 Service 访问层。 */
  ApiLayer = "api_layer",
  /** Domain 与业务不变量层。 */
  DomainLayer = "domain_layer",
  /** Infrastructure 与外部系统适配层。 */
  InfrastructureLayer = "infrastructure_layer",
  /** UI Component 或 Design System 层。 */
  ComponentLayer = "component_layer",
  /** State、Store 或事件数据流层。 */
  StateLayer = "state_layer",
  /** 生成代码边界。 */
  GeneratedBoundary = "generated_boundary",
}

/** Candidate 的证据置信来源。 */
export enum ProjectCandidateConfidence {
  /** 来自可结构化解析的显式配置。 */
  ExplicitConfiguration = "explicit_configuration",
  /** 来自目录或文件命名，只能作为 Human 评审候选。 */
  StructuralHeuristic = "structural_heuristic",
  /** 扫描不完整，任何结论都必须降级。 */
  PartialScan = "partial_scan",
}
