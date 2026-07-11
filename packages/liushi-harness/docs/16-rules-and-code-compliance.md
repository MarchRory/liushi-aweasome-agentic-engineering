# 16 Rules 与代码合规

## 1. 问题定义

仅让 Agent 读取代码风格或执行 ESLint，不能保证生成代码符合真实项目：

- 项目可能同时存在主流架构、遗留架构和错误示例，数量最多的写法不一定是正确写法。
- Lint 能约束语法和局部风格，但无法单独约束模块分层、数据流、公共组件、状态管理和业务不变量。
- Wiki、AGENTS、Rule、Skill、Policy 和测试如果没有边界，会形成互相重复且冲突的长 Prompt。
- Agent 可能知道规则，但没有在 Plan、写入和 Review-ready 阶段证明自己遵守了规则。
- 业务机制变化可能被伪装成普通重构，绕过 Human 对当前逻辑和改动方案的确认。

因此 `liushi-harness` 需要一个独立的 Rules/Code Compliance 子系统，将“怎样才算符合项目”变成可发现、可解析、可执行、可审计和可演进的契约。

### 1.1 当前实现切片

当前代码已经实现 Rule Definition、Project Rule Catalog、Rule Resolution Context、Applicable Rule Bundle、RFC 8785 Digest 和只读 `rules resolve` CLI。当前 Resolver 具备以下确定性保证：

- 只有 `Active` Rule 进入 Applicable 集合；其余状态只进入 `excluded` 审计字段。
- `Blocking` Rule 必须声明 Validator，运行环境缺少该 Validator 时 Bundle 为 `blocked`。
- `familyKey` 与 `outcomeKey` 表达结构化规则族和结果，不使用自然语言相似度推断冲突。
- 更具体 Scope 只能用更严格 Enforcement 改变同 Family Outcome；不能削弱上层保护。
- Catalog 与 Organization、WorkspaceGraph、Repository、ProjectProfile 或 ArchitectureMechanismProfile 身份/Revision 漂移时 Fail Closed。
- Resolver 对 Blocking Validator 不变量执行纵深校验；即使嵌入式调用方绕过 Schema，也会输出 `definitionViolations` 并阻断。
- Catalog、Rule 和 Bundle Digest 均由同一 RFC 8785 + SHA-256 Adapter 计算并校验。

Validator 执行、Candidate Promotion、ComplianceReport、Rule Exception 和 G8 仍是后续切片。当前命令不会修改项目、自动激活 Rule、晋升 Profile 或声明代码已经合规。

当前 Project Scanner 切片补充以下只读能力：

- `project scan` 从 JSON manifest 读取显式多仓列表；每个仓库必须声明 `repositoryId`、`localRoot`、`repositoryRevision`，manifest 不接受预算字段。
- Project Scanner 不使用人工容量或读取预算；全量遍历普通目录和文件，并读取全部被分类的配置文件。规模本身不影响完整性，超时和取消属于当前切片尚未建模的运行时编排问题。
- `localRoot` 只用于本机扫描，不进入报告、Candidate、诊断、依赖边或任何 digest 输入。
- JSON/JSONC、YAML、package manifest 和 TypeScript compiler config 使用确定性 parser 读取；JS/TS 可执行配置、lockfile、CODEOWNERS、AGENTS.md、CLAUDE.md 等只记录存在或摘要，不执行、不导入。
- 生成的 Rule 与 Architecture Mechanism 只能是 Candidate；目录结构和依赖声明只是 Evidence，不足以自动判定 Preferred、Active 或 Blocking。
- 重复 package owner 产生稳定 `dependencyAmbiguities` 并使报告 `incomplete`；Scanner 不静默丢边，也不自行决定哪个 Repository 是真实 owner。
- 报告状态为 `incomplete` 时，CLI 返回 blocked envelope 和退出码 `4`；这些结果必须 Human Review 后才能进入后续 Promotion 或正式规则源。
- `profilePromotionStatus` 当前固定为 `HumanReviewRequired`。扫描 `complete` 或 CLI 退出码 `0` 不能被解释为批准流程已经实现，`isProjectProfilePromotionBlocked` 仍阻塞 Profile Promotion。

## 2. 概念边界

| 概念      | 回答的问题                   | 示例                             | 是否直接执行                 |
| --------- | ---------------------------- | -------------------------------- | ---------------------------- |
| Rule      | 代码或设计必须/应当满足什么  | 禁止 Domain 导入 Infrastructure  | 由 Validator/Gate 执行       |
| Policy    | 某个动作是否允许或需要谁批准 | 修改公共层需要 Human Gate        | 由 Policy Engine 执行        |
| Skill     | 完成某类任务应按什么流程     | 需求澄清、方案评审、合规检查     | 编排 CLI、Role 和 Connector  |
| Knowledge | 当前项目有哪些事实和背景     | API Client 位于 `src/services`   | 作为带 Provenance 的 Context |
| Validator | 如何机械证明一个条件         | ESLint、Typecheck、AST Rule      | 执行并生成 Evidence          |
| Pattern   | 推荐、遗留或禁止的具体范例   | Approved Component、Legacy Store | 指导生成和 Review            |

边界规则：

- Rule 不能授予权限；权限属于 Policy。
- Skill 不能复制 Rule Engine；Skill 调用 `rules resolve/check`。
- Knowledge 不自动成为 Rule；必须经过 Candidate、Eval 和 Human Review。
- Validator 只判断，不自动修改代码制造通过结果。
- Pattern 的存在不等于它是正确规则，必须有分类和 Evidence。

## 3. Rule 类型

```ts
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
  /** 扫描或 AI 新生成，尚未评审。 */
  Candidate = "candidate",
  /** 正在执行正向、反向和历史任务 Eval。 */
  Evaluating = "evaluating",
  /** Human 已确认，可在声明 Scope 内解析和执行。 */
  Active = "active",
  /** Source 或项目机制漂移，不能继续作为正式依据。 */
  Stale = "stale",
  /** 新 Rule 或新项目机制已经替代该 Rule。 */
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
  /** 只对一个 Task 有效的已批准例外或补充。 */
  Task = "task",
}

/** 一个可解析、可执行并可审计的项目 Rule。 */
export interface RuleDefinition {
  /** Rule Definition Schema Version。 */
  schemaVersion: string;
  /** 经 Registry 校验且跨 Revision 稳定的 Rule ID。 */
  ruleId: string;
  /** Rule 内容的三段式 SemVer。 */
  version: string;
  /** Rule 当前生命周期状态。 */
  status: RuleStatus;
  /** Rule 约束的质量或业务维度。 */
  category: RuleCategory;
  /** Rule 违反时的处理方式。 */
  enforcement: RuleEnforcement;
  /** 将同一语义约束归组的显式 Registry Key。 */
  familyKey: string;
  /** 表示该 Family 当前要求结果的显式 Registry Key。 */
  outcomeKey: string;
  /** 包含 Workspace、Repository、Path 或 Task 身份的判别 Scope。 */
  scope: RuleScope;
  /** 路径、模块、语言、文件类型和操作条件选择器。 */
  selector: RuleSelector;
  /** Agent、Human 和 Validator 使用的明确规则陈述。 */
  statement: string;
  /** 解释规则存在原因、风险和不变量。 */
  rationale: string;
  /** 能够机械执行该 Rule 的 Validator ID。 */
  validatorIds: string[];
  /** 解析或执行 Rule 前必须具备的 Capability ID。 */
  requiredCapabilityIds: string[];
  /** 不复制原文的最小 Provenance 引用。 */
  sourceRefs: RuleSourceRef[];
  /** 来源变化后应使 Rule 失效的引用。 */
  invalidationRefs: RuleSourceRef[];
  /** 经确认的正向代码范例引用。 */
  approvedExampleRefs: CodeExampleRef[];
  /** 遗留、错误或禁止代码范例引用。 */
  negativeExampleRefs: CodeExampleRef[];
  /** Human 显式确认不能同时生效的 Rule ID。 */
  conflictsWithRuleIds: string[];
  /** 负责确认和维护该 Rule 的 Actor。 */
  owner: ActorRef;
  /** 最后一次 Human Review 的 ISO 8601 UTC 时间。 */
  reviewedAt?: string;
  /** 对除 digest 外全部机器字段计算的 RFC 8785 Digest。 */
  digest: string;
}
```

规则要求：

- `Blocking` Rule 必须至少关联一个确定性 Validator。只有 AI 判断的 Rule 不能宣称 Blocking。
- `Active` Rule 必须有可信 Owner、`reviewedAt` 和至少一个 Provenance Source；Agent 不能直接成为 Active Rule Owner。
- 语义复杂但无法完全机械验证的架构或业务 Rule 使用 `ApprovalRequired`。
- `Advisory` 不能被展示成“检查通过”，只能生成建议或 Candidate。
- Rule ID 是开放 Registry 标识符，不使用无法扩展的全局 Enum。
- Selector 的 Repository、Path Glob、Language、FileKind 和 Operation 维度之间按 AND 合并，同一维度内按 OR 合并。
- Path 使用 Repository 相对路径和正斜杠；Glob 禁用 Brace 与 Extglob，固定区分大小写并匹配 Dotfile，保证 Windows/Linux 一致。

## 4. Pattern 分类

```ts
/** Project Scanner 发现的代码 Pattern 应如何被 Agent 使用。 */
export enum PatternClassification {
  /** 由配置、测试或 Human 明确强制的写法。 */
  Enforced = "enforced",
  /** 经评审、适合新代码但尚未完全机械化的推荐写法。 */
  Preferred = "preferred",
  /** 为兼容保留但禁止新代码继续复制的历史写法。 */
  Legacy = "legacy",
  /** 已知错误、安全风险或架构违规写法。 */
  Forbidden = "forbidden",
  /** 当前 Evidence 不足，不能作为 Agent 模仿依据。 */
  Unknown = "unknown",
}
```

Scanner 不能用“出现次数最多”自动将 Pattern 标记为 Preferred。分类必须来自确定性配置、已确认 ADR、测试、CODEOWNERS、Wiki Evidence 和 Human Review。

## 5. Repository 目录

```text
<repo>/.liushi-harness/
├── project.yaml
├── policy.yaml
├── rules/
│   ├── index.yaml
│   ├── code-style/
│   │   └── <rule-id>/
│   │       ├── rule.yaml
│   │       ├── guidance.md
│   │       └── fixtures/
│   ├── architecture/
│   ├── domain/
│   ├── security/
│   ├── testing/
│   └── user-interface/
├── mechanisms/
│   ├── architecture.yaml
│   ├── data-flow.yaml
│   └── approved-patterns.yaml
├── validators/
│   └── catalog.yaml
└── knowledge/
```

职责：

- `rule.yaml` 保存机器可解析字段和 Digest。
- `guidance.md` 只保存必要解释、边界和例子，不重复机器字段。
- `fixtures/` 保存最小正向和负向 Eval，不复制整个业务模块。
- `mechanisms/` 描述项目如何组织业务代码，而不是保存通用最佳实践文章。
- Approved Example 优先引用 Repository Path + Commit，不复制一份容易过期的代码。
- `index.yaml` 是路由索引，不把全部 Rule 内容堆成一个巨大文件。

## 6. ArchitectureMechanismProfile

ProjectProfile 负责工程发现；ArchitectureMechanismProfile 负责描述“业务代码应该如何接入项目现有机制”：

- 模块、Layer、Package 和允许依赖方向。
- 页面、组件、Hook、Service、Domain 和 Adapter 的责任。
- API Client、DTO Mapping、Cache 和 Error Handling。
- 全局/局部 State、Event、Command 和数据流。
- Auth、Permission、Feature Flag 和灰度机制。
- Design System、公共组件、样式、国际化和可访问性。
- Logging、Analytics、Trace 和异常上报。
- Schema、兼容策略、公共层和生成代码边界。
- Test Fixture、Mock、E2E 和发布验证路径。
- Approved、Legacy、Forbidden 和 Unknown Pattern。

每个机制项包含 Owner、Evidence、Revision、适用路径和失效条件。AI 推断只能生成 Proposal；Human 必须确认哪些是正式机制、哪些只是历史现象。

## 7. Rule 来源与优先级

来源从强到弱：

1. Harness Hard Invariant。
2. Organization Rule Pack。
3. Workspace Rule Pack。
4. Repository Active Rule。
5. Path/Module Active Rule。
6. Task 级已批准补充或例外。
7. Built-in Best Practice Advisory。

合并原则：

- 更严格的 Enforcement 获胜。
- 更具体 Scope 只能补充或收紧，不能削弱上层 Blocking Rule。
- 同级 Active Rule 冲突时 Fail Closed，生成 Human DecisionRequest。
- Built-in Best Practice 与项目确认机制冲突时，以项目机制为准并记录原因。
- Candidate、Stale、Rejected 和 Unknown Pattern 不进入正式 Rule Resolution。

## 8. Onboarding 发现

```text
deterministic scan
  -> source facts and pattern candidates
  -> AI interpretation proposal
  -> Human classification and ownership
  -> Rule/Mechanism candidates
  -> validator and fixture evaluation
  -> approved Rule Catalog revision
```

确定性扫描输入：

- ESLint、Prettier、TypeScript、Build 和 Test 配置。
- Package、Import、Path Alias 和 Dependency Graph。
- CI、CODEOWNERS、Commit Hook 和 Release Script。
- Framework Router、State、API、Error、Analytics 和 Feature Flag 入口。
- AGENTS、Rules、Skills、ADR、Wiki 和项目文档。
- Git History、Revert、Review Feedback 和现有 Architecture Test。

Human Review 必须特别确认：

- 新代码应该模仿哪些模块。
- 哪些高频写法属于 Legacy。
- 哪些公共机制禁止绕过。
- 哪些 Rule 可以机械阻断，哪些需要 Human 判断。

## 9. Rule Resolution

每个 Task 在 Planning 阶段确定性生成 ApplicableRuleBundle：

```text
Active Rule Catalog
  -> Task Read/Write Set
  -> Repository/Path/Language selectors
  -> ArchitectureMechanismProfile
  -> capability and validator availability
  -> precedence and conflict resolution
  -> ApplicableRuleBundle + digest
```

Bundle 包含：

- Task、Workspace、Repository 和 Base Revision。
- Rule ID、Version、Digest、Enforcement 和来源 Scope。
- 关联 Architecture Mechanism 和 Approved Example。
- 必需 Validator 和 Human Gate。
- 冲突、Unknown 和未满足 Capability。
- Bundle Digest。

PlanRisk、Implementation 和 EvidenceBundle 都绑定该 Digest。Rule 或机制发生变化后旧 Plan 和 Approval 失效。

当前可运行入口：

```powershell
liushi-harness rules resolve --catalog .\ruleCatalog.json --context .\ruleContext.json --json
```

命令完成输入校验后生成 Bundle。`resolutionStatus=ready` 返回退出码 `0`；`resolutionStatus=blocked` 将完整 Bundle 写入 stdout，同时返回 JSON `status=blocked` 和退出码 `4`，调用方必须停止并根据 `conflicts`、`missingValidators`、`missingCapabilities`、`contextDrifts` 或 `definitionViolations` 请求 Human/系统处理。`excluded` 只用于 Explain/Audit，不进入 Bundle Digest 或执行规则集合。

## 10. Agent 编码指导

### 写码前

- Context Assembler 只注入与 Write Set 匹配的 RuleBundle。
- Orchestrator 在 Plan 中列出适用 Rule ID、文件放置、依赖方向和复用机制。
- 对业务功能说明应复用的 API、State、Error、Component 和 Test Pattern。
- 无 Approved Pattern 时标记 Unknown，不根据相似名字自行发明项目机制。

### 写码中

- PreAction 检查路径、依赖和禁止操作。
- PostAction 对已变更文件运行快速 Rule Validator。
- 新 Import、公共 API、状态容器或机制绕过触发增量 Risk Check。
- Rule 违反时返回 Rule ID、原因、Evidence 和合法替代，不只返回“Lint 失败”。

### 写码后

- 运行完整 Applicable Validator Set。
- Independent Verifier 按同一 RuleBundle Review。
- 生成 RuleComplianceReport。
- 未解决 Blocking Violation 禁止 Review-ready。
- ApprovalRequired Violation 必须有 Rule Exception 或 Architecture Change Approval。

## 11. RuleComplianceReport

```ts
/** 单条 Rule 在目标 Revision 上的合规结果。 */
export enum RuleComplianceStatus {
  /** Validator 或有效 Evidence 已证明满足 Rule。 */
  Compliant = "compliant",
  /** 已证明违反 Rule，且尚未获得有效例外。 */
  NonCompliant = "non_compliant",
  /** 当前 Capability 或 Evidence 不足，不能确定结果。 */
  Undetermined = "undetermined",
  /** Human 已批准有范围和期限的 Rule Exception。 */
  Excepted = "excepted",
}

/** 将 Applicable Rule 与文件、Validator 和 Evidence 关联的合规记录。 */
export interface RuleComplianceEntry {
  /** 被检查 Rule 的稳定 ID。 */
  ruleId: string;
  /** 被检查 Rule Revision 的 Digest。 */
  ruleDigest: string;
  /** 当前目标 Revision 的合规状态。 */
  status: RuleComplianceStatus;
  /** 该 Rule 实际检查的文件和模块。 */
  targetLocators: string[];
  /** 执行该 Rule 的 Validator ID。 */
  validatorIds: string[];
  /** 支撑结果的 Evidence ID。 */
  evidenceIds: string[];
  /** Excepted 时绑定的 Rule Exception ID。 */
  exceptionId?: string;
}
```

EvidenceBundle 保存完整 RuleComplianceReport，并在 Review Summary 中突出 NonCompliant、Undetermined 和 Excepted。

## 12. 确定性执行

优先复用项目现有工具：

- ESLint、Prettier、TypeScript、Stylelint 和 Framework Lint。
- Unit、Integration、Contract 和 Playwright Test。
- Dependency Graph、Architecture Test 和 Package Boundary。
- Semgrep、CodeQL、Secret/Dependency Scanner。
- 项目已有 Code Generator、Schema Check 和 Design System Validator。

Harness 只在现有工具无法表达关键 Rule 时增加可测试的 AST/Graph Validator。禁止把 Blocking Rule 仅写入 Prompt 或只交给 Agent 自检。

## 13. 业务机制变化

以下操作不是普通 Rule Violation：

- 引入新的 State、API、Event、Cache 或 Error 机制。
- 绕过现有公共层或重复实现公共能力。
- 改变 Domain Invariant、数据流或兼容行为。
- 将 Legacy Pattern 扩散到新模块。
- 修改 ArchitectureMechanismProfile 本身。

Task 必须生成 ArchitectureMechanismChangeContract，包含当前机制、Evidence、改动原因、替代项、影响面、迁移、验证和回滚。涉及业务行为时同时触发 BusinessLogicChangeContract。

## 14. Rule Exception 与 Gate

Rule Exception 不是关闭 Lint 或修改 Rule：

- 绑定 Task、Rule Digest、目标文件、Target Revision 和原因。
- 指定 Owner、补偿措施和 Expiry。
- 不能覆盖 Harness/Organization 不可豁免 Rule。
- 代码或 Rule Digest 变化后自动失效。
- Review-ready 和最终 PR Summary 中显著展示。

新增 G8 Rule/Architecture Gate：

- 临时 Rule Exception 需要 Human Approval。
- Architecture Mechanism Change 需要对应 Owner Approval。
- 永久修改 Rule 通过 G7 Promotion，而不是复用临时 Exception。

## 15. AGENTS、Skill 与 Hook

- `AGENTS.md` 只保存短路由：如何调用 Rules、在哪里查机制、哪些动作必须停止。
- 详细 Rule 不复制进 `AGENTS.md`，避免上下文膨胀和双份维护。
- `project-rules` Skill 负责 `scan/resolve/explain/check/propose` 流程。
- SessionStart 注入 RuleBundle 摘要和 Digest。
- PreAction/PostAction 调用同一个 Rule Engine。
- Stop Hook 检查 RuleComplianceReport 是否完整，但不能伪造结果。

`AGENTS.md`/`CLAUDE.md` 的 Canonical Source、内容预算、路径 Scope 和 Managed Projection 见 [17 Instruction Projection](./17-instruction-projection.md)。

## 16. Built-in Best Practice Pack

Harness 可以提供通用 Candidate Pack，例如：

- TypeScript Strict、类型与错误处理。
- React Component、Hook 和 Accessibility。
- API Boundary、DTO Mapping 和 Error Normalization。
- Test Pyramid、Fixture 和 Mock Boundary。
- Logging、Telemetry 和 Secret Handling。

这些 Pack 默认是 Candidate/Advisory。Onboarding 必须根据项目框架、版本和机制由 Human 选择并确认，不能以“业界最佳实践”为理由强行改写现有项目架构。

## 17. Rule 学习与改进

Candidate 来源：

- Human 重复指出同类 Code Review 问题。
- Blocking Validator 漏检并导致返工或 Incident。
- Agent 多次选择错误目录、依赖或项目机制。
- Approved Pattern 漂移或 Legacy Pattern 扩散。
- 新 ADR、Framework Migration 或业务机制确认。

Learning Curator 只生成 Rule/Validator/Pattern Candidate。Promotion 要求：

- Evidence 和 Owner。
- 至少一个正向和负向 Fixture。
- 对历史 Task 的 Regression Eval。
- False Positive 和影响范围。
- G7 Human Approval。

## 18. Drift 与冲突

`rules audit` 检查：

- Config、Validator 或 Approved Example Revision 变化。
- Rule 无 Validator、Owner 或有效 Evidence。
- 多数代码与 Active Rule 冲突。
- 同 Scope Rule 互相矛盾。
- Rule 长期无命中或总被 Exception。
- Architecture Mechanism 与实际依赖图漂移。

代码多数与 Rule 冲突时不能自动修改 Rule。可能是 Rule 过时，也可能是违规扩散，必须生成 Review Queue。

## 19. CLI 草案

```powershell
liushi-harness rules scan --repo <repo-id> --dry-run
liushi-harness rules review --repo <repo-id>
liushi-harness rules approve <candidate-id>
liushi-harness rules resolve --task <task-id>
liushi-harness rules explain <rule-id>
liushi-harness rules check --task <task-id>
liushi-harness rules exception <rule-id> --task <task-id> --dry-run
liushi-harness rules audit --workspace <workspace-id>
```

所有命令提供稳定 JSON 输出。`resolve` 和 `check` 是确定性命令，不调用隐藏模型。

## 20. Metrics

- First-pass Rule Compliance Rate。
- Blocking Violation 数量和修复轮数。
- Architecture/Domain Rule 在 Review 阶段的漏检。
- Rule Exception 数量、过期和重复出现。
- Human 重复 Code Review Feedback。
- Agent 错误目录、错误依赖和重复机制次数。
- Rule/Validator False Positive。
- Applicable RuleBundle 大小和 Context Token Cost。

Rule 数量和 Prompt 长度不是成功指标。目标是减少真实违规、返工和 Human 重复指导。

## 21. 测试要求

- Rule Schema、String Enum、TSDoc 和 Digest。
- Scope、Selector、Precedence 和更严格规则获胜。
- 同级冲突 Fail Closed。
- Candidate/Stale Rule 不进入 Bundle。
- RuleBundle 与 Plan/Revision 漂移失效。
- Blocking Rule 必须有关联 Validator。
- Approved/Legacy/Forbidden/Unknown Pattern 选择。
- AGENTS 路由不复制完整 Rule。
- PreAction、PostAction 和 Review-ready 一致执行。
- Rule Exception Scope、Expiry 和不可豁免 Rule。
- Prompt Injection 不能创建或关闭 Active Rule。
- Architecture Mechanism Change 触发 Human Gate。
- Rule Candidate Regression 和 False Positive Fixture。

## 22. 首月范围

- 实现 Rule Schema、Catalog、Resolver、Bundle Digest 和 Compliance Report。
- 从 ESLint、TypeScript、Package、Import Graph 和 ProjectProfile 发现 Rule Candidate。
- 支持 CodeStyle、Architecture、Testing 和关键 Domain Rule。
- Codex Context/Skill/Hook 接入 RuleBundle。
- 复用现有 Validator，增加最小 Import Boundary AST/Graph Check。
- 支持 Rule Exception 和 G8 Gate。
- 自动生成 Candidate，不自动修改 Active Rule。
- 不建设通用在线 Rule Marketplace 或自动修复所有违规。
