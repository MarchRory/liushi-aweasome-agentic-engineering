/** Rule 约束的软件质量或业务维度。 */
export enum RuleCategory {
  /** 文件命名、格式、类型和局部编码约定。 */
  CodeStyle = "code_style",
  /** 模块分层、依赖方向、目录责任和数据流。 */
  Architecture = "architecture",
  /** 业务行为、领域状态和兼容性不变量。 */
  DomainInvariant = "domain_invariant",
  /** 权限、数据、Secret、依赖和输入处理要求。 */
  Security = "security",
  /** Test 类型、覆盖范围、Fixture 和验证要求。 */
  Testing = "testing",
  /** 组件、交互、可访问性和 Design System 约束。 */
  UserInterface = "user_interface",
  /** 日志、指标、Trace、埋点和故障诊断约束。 */
  Observability = "observability",
  /** Public API、Schema、版本和历史行为兼容要求。 */
  Compatibility = "compatibility",
}

/** Rule 违反时 Harness 必须采用的执行方式。 */
export enum RuleEnforcement {
  /** 由确定性 Validator 证明，违反后禁止进入 Review-ready。 */
  Blocking = "blocking",
  /** 需要语义判断，违反或例外必须进入 Human Gate。 */
  ApprovalRequired = "approval_required",
  /** 仅提供建议和 Finding，不单独阻断交付。 */
  Advisory = "advisory",
}

/** Rule 从生成到失效的生命周期状态。 */
export enum RuleStatus {
  /** 扫描器或 AI 新生成，尚未评审。 */
  Candidate = "candidate",
  /** 正在执行正向、反向和历史任务 Eval。 */
  Evaluating = "evaluating",
  /** 已获得可信 Actor 确认，可在声明 Scope 内执行。 */
  Active = "active",
  /** Source 或项目机制漂移，不能继续作为正式依据。 */
  Stale = "stale",
  /** 新 Rule 或项目机制已经替代该 Rule。 */
  Superseded = "superseded",
  /** Human 或 Eval 已拒绝该 Rule。 */
  Rejected = "rejected",
}

/** Rule 生效范围的层级。 */
export enum RuleScopeLevel {
  /** Harness 自身不可被项目削弱的通用不变量。 */
  Harness = "harness",
  /** 企业统一的安全、合规或工程约束。 */
  Organization = "organization",
  /** 一个多仓 Workspace 共享的规则。 */
  Workspace = "workspace",
  /** 一个 Repository 的工程和业务规则。 */
  Repository = "repository",
  /** 一个目录、模块、Package 或代码所有权范围。 */
  Path = "path",
  /** 只对一个 Task 有效的已批准补充。 */
  Task = "task",
}

/** Rule Selector 可以约束的文件操作。 */
export enum RuleOperation {
  /** 读取既有内容。 */
  Read = "read",
  /** 创建新文件或资源。 */
  Create = "create",
  /** 修改既有文件或资源。 */
  Modify = "modify",
  /** 删除既有文件或资源。 */
  Delete = "delete",
  /** 移动或重命名既有文件或资源。 */
  Move = "move",
  /** 执行命令、脚本或可执行资源。 */
  Execute = "execute",
}

/** Rule Selector 使用的目标文件类别。 */
export enum RuleFileKind {
  /** 产品或库的源代码。 */
  Source = "source",
  /** 自动化测试代码或 Fixture。 */
  Test = "test",
  /** 构建、工具、CI 或运行时配置。 */
  Configuration = "configuration",
  /** Markdown、ADR、API 或其他文档。 */
  Documentation = "documentation",
  /** 由确定性工具生成且通常禁止手工修改的文件。 */
  Generated = "generated",
  /** 当前尚不能可靠分类的文件。 */
  Unknown = "unknown",
}

/** Rule 来源引用的封闭类别。 */
export enum RuleSourceKind {
  /** Harness 内置且经过测试的硬不变量。 */
  HarnessInvariant = "harness_invariant",
  /** 企业规则包或合规策略。 */
  OrganizationPolicy = "organization_policy",
  /** Workspace、Repository 或工具配置文件。 */
  ProjectFile = "project_file",
  /** Git Revision、Diff 或历史记录。 */
  Git = "git",
  /** Wiki 或内部知识库页面。 */
  Wiki = "wiki",
  /** 工单、Issue 或需求系统条目。 */
  Ticket = "ticket",
  /** 可识别 Human 的评审或决策。 */
  HumanDecision = "human_decision",
  /** 自动化测试、Lint 或静态分析结果。 */
  ValidatorEvidence = "validator_evidence",
}

/** Rule Resolver 生成的 Bundle 是否可作为执行依据。 */
export enum RuleResolutionStatus {
  /** 所有执行前不变量均满足。 */
  Ready = "ready",
  /** 存在冲突、漂移或缺失能力，必须 Fail Closed。 */
  Blocked = "blocked",
}

/** Rule 未进入 Applicable 集合的确定性原因。 */
export enum RuleExclusionReason {
  /** 生命周期状态不是 Active。 */
  InactiveStatus = "inactive_status",
  /** Rule Scope 未覆盖任何显式目标。 */
  ScopeMismatch = "scope_mismatch",
  /** Selector 未命中 Scope 覆盖的任何目标。 */
  SelectorMismatch = "selector_mismatch",
}

/** Rule Resolver 可以确定性识别的冲突类型。 */
export enum RuleConflictKind {
  /** Rule 显式声明与另一条命中规则冲突。 */
  Explicit = "explicit",
  /** 同一 Rule ID 的多个 Active Version 同时命中。 */
  MultipleActiveVersions = "multiple_active_versions",
  /** 同一 Scope 与 Family 声明了不同 Outcome。 */
  SameScopeOutcome = "same_scope_outcome",
  /** 更具体 Scope 试图以更弱 Enforcement 改变上层 Outcome。 */
  InvalidWeakening = "invalid_weakening",
}

/** Catalog 与当前 Workspace Context 发生的漂移类型。 */
export enum RuleContextDriftKind {
  /** Catalog 指向了不同 Workspace。 */
  WorkspaceIdentity = "workspace_identity",
  /** Workspace 所属 Organization 已变化。 */
  OrganizationIdentity = "organization_identity",
  /** Workspace Graph Revision 已变化。 */
  WorkspaceGraphRevision = "workspace_graph_revision",
  /** Catalog 缺少目标 Repository。 */
  RepositoryMissing = "repository_missing",
  /** Repository Base Revision 已变化。 */
  RepositoryRevision = "repository_revision",
  /** Project Profile Revision 已变化。 */
  ProjectProfileRevision = "project_profile_revision",
  /** Architecture Mechanism Profile Revision 已变化。 */
  ArchitectureMechanismProfileRevision = "architecture_mechanism_profile_revision",
}

/** Resolver 对已解析 Rule 执行的纵深防御不变量。 */
export enum RuleDefinitionViolationKind {
  /** Blocking Rule 没有声明任何确定性 Validator。 */
  BlockingValidatorMissing = "blocking_validator_missing",
}
