# 17 Instruction Projection 与执行器指导文件

## 1. 目标

`AGENTS.md`、`CLAUDE.md` 和执行器项目配置是 Agent 进入仓库时最先读取的指导面，但它们不能各自发展为独立真源。Instruction Projection 子系统负责：

- 用平台无关 Contract 保存长期项目指导。
- 按 Repository 和 Path Scope 生成短小、确定、可审计的执行器文件。
- 不复制完整 Rule、Knowledge、Skill 和 Agent Prompt。
- 在已有 Human 文件存在时生成 Merge Proposal，不静默覆盖。
- 记录 Source、Target、Revision 和 Digest，支持 Drift、Upgrade 和 Uninstall。
- Codex、Claude-compatible 和 Generic Adapter 使用同一语义基线。

Codex 从项目根目录向当前目录组装 `AGENTS.md`，越靠近目标目录的指导越晚进入上下文；默认总量上限为 32 KiB。[Codex AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md#how-codex-discovers-guidance)

Claude Code 使用 `CLAUDE.md`、路径 Rule 和 Auto Memory，但这些内容属于 Context，不是机械执行配置。[Claude Code Memory](https://code.claude.com/docs/en/memory)

## 2. 概念边界

| 概念            | 责任                           | 示例                               |
| --------------- | ------------------------------ | ---------------------------------- |
| Instruction     | 每次进入作用域都应知道的短指导 | 使用 pnpm、从 Harness Resume Task  |
| Rule            | 代码或设计必须满足的结果       | Domain 禁止依赖 Infrastructure     |
| Policy          | 动作是否允许以及是否需要审批   | 公共层写入需要 G3                  |
| Skill           | 可复用的多步骤流程             | Requirement Battle、Memory Curator |
| Knowledge       | 带来源和失效条件的项目事实     | API Owner、历史兼容原因            |
| AgentDefinition | 一个受限角色如何运行           | Verifier 的模型、工具和输出 Schema |

边界要求：

- Instruction 可以路由到 Rule、Skill 和 CLI，不能重新实现它们。
- Instruction 不能授予权限、批准 Gate 或声明验证通过。
- 临时 Task 事实进入 ContextBundle，不写入长期指导文件。
- 平台生成文件不是 Canonical Source，Human 修改必须先反向生成 Proposal。
- Blocking 要求继续由 Validator、Policy、Hook 和 CI 执行。

## 3. Canonical Contract

```ts
/** Instruction 可以稳定生效的作用域层级。 */
export enum InstructionScopeLevel {
  /** 企业统一但允许项目补充的开发指导。 */
  Organization = "organization",
  /** 一个多仓 Workspace 共同采用的指导。 */
  Workspace = "workspace",
  /** 一个 Repository 根目录采用的指导。 */
  Repository = "repository",
  /** 一个目录、模块或 Package 采用的局部指导。 */
  Path = "path",
  /** 只对当前 Task 有效且不写入长期平台文件的指导。 */
  Task = "task",
}

/** Instruction 表达的主要用途。 */
export enum InstructionPurpose {
  /** 说明如何初始化、诊断和恢复 Harness。 */
  Bootstrap = "bootstrap",
  /** 说明项目日常开发和交付工作流。 */
  Workflow = "workflow",
  /** 路由到正式 Rule、Skill、Knowledge 或文档。 */
  Routing = "routing",
  /** 列出经 ProjectProfile 确认的验证入口。 */
  Validation = "validation",
  /** 描述必须停止并请求 Human 的条件。 */
  StopCondition = "stop_condition",
  /** 描述 Review 时必须关注的项目特有问题。 */
  Review = "review",
}

/** Instruction 从提案到废弃的生命周期。 */
export enum InstructionStatus {
  /** 自动发现或 AI 生成，尚未评审。 */
  Candidate = "candidate",
  /** 正在执行冲突、长度和遵循度 Eval。 */
  Evaluating = "evaluating",
  /** Human 已确认，可以进入平台投影。 */
  Active = "active",
  /** Source Revision 漂移，暂时停止生成。 */
  Stale = "stale",
  /** 已被更精确的新 Instruction 替代。 */
  Superseded = "superseded",
  /** Human 或 Eval 明确拒绝。 */
  Rejected = "rejected",
}

/** Harness 首月支持的指导投影目标。 */
export enum InstructionProjectionTarget {
  /** Codex 根目录或路径级 AGENTS.md。 */
  CodexAgents = "codex_agents",
  /** Claude-compatible 根目录 CLAUDE.md。 */
  ClaudeMemory = "claude_memory",
  /** Claude-compatible 路径级 Rule 文件。 */
  ClaudePathRule = "claude_path_rule",
  /** 不具备原生指导文件时使用的通用 Context Bundle。 */
  GenericBundle = "generic_bundle",
}

/** 一条可编译为平台指导的 Canonical Instruction。 */
export interface InstructionDefinition {
  /** 跨 Revision 稳定的 Instruction ID。 */
  instructionId: string;
  /** Instruction Schema 和内容版本。 */
  version: string;
  /** 当前生命周期状态。 */
  status: InstructionStatus;
  /** 指导的主要用途。 */
  purpose: InstructionPurpose;
  /** 指导可以生效的最大作用域。 */
  scopeLevel: InstructionScopeLevel;
  /** Repository、Path、文件类型和语言选择器。 */
  selector: InstructionSelector;
  /** 应进入执行器上下文的短指导正文。 */
  statement: string;
  /** 需要进一步读取的 Rule、Skill、Knowledge 或文档引用。 */
  referenceIds: string[];
  /** 能够接收该语义的投影目标。 */
  targets: InstructionProjectionTarget[];
  /** 支撑该指导的 Evidence ID。 */
  evidenceIds: string[];
  /** 负责确认和维护该指导的 Actor。 */
  owner: ActorRef;
  /** Source、Revision、时间或条件失效规则。 */
  invalidationRules: InstructionInvalidationRule[];
}
```

`Task` Scope 只参与运行时 Context 组装，不投影到仓库级 `AGENTS.md` 或 `CLAUDE.md`，防止一个需求的临时决策污染后续任务。

## 4. Canonical 目录

```text
<repo>/.liushi-harness/
├── instructions/
│   ├── index.yaml
│   ├── repository.yaml
│   └── paths/
│       └── <path-id>.yaml
├── generated/
│   └── instructions/
│       ├── codex-manifest.json
│       ├── claude-compatible-manifest.json
│       └── generic-bundle.json
└── managed-files.json
```

执行器投影：

```text
<repo>/AGENTS.md
<repo>/<scoped-path>/AGENTS.md
<repo>/CLAUDE.md
<repo>/.claude/rules/<scope-id>.md
```

规则：

- `.liushi-harness/instructions/` 是 Canonical Source。
- 平台文件由 Adapter 生成并登记到 `managed-files.json`。
- Repository 原有文件不是 Harness 所有；首次接入只生成 Diff Proposal。
- Human 接受接管后，Manifest 记录 Base Digest、Generated Digest 和 Ownership Mode。
- 文件包含未知修改时停止更新，不通过重新渲染覆盖。

## 5. Instruction Resolution

确定性优先级：

```text
Harness Hard Instruction
  -> Organization Active Instruction
  -> Workspace Active Instruction
  -> Repository Active Instruction
  -> Path Active Instruction
  -> Task Context Instruction
```

合并原则：

- 更具体 Scope 可以补充一般工作方式，但不能削弱 Hard Invariant、Policy 和 Blocking Rule。
- 同 Scope 指导矛盾时 Fail Closed，生成 Conflict Proposal。
- Candidate、Stale、Superseded 和 Rejected 不进入正式投影。
- 相同语义按稳定 ID 去重，不按自然语言相似度自动合并。
- 平台不支持等价 Scope 时，Adapter 必须声明 Flatten、Degraded 或 Unsupported。

## 6. 编译流程

```text
Active Instruction Catalog
  -> resolve repository/path scope
  -> resolve Rule/Skill/Knowledge references
  -> validate references and ownership
  -> enforce target content budget
  -> render platform templates
  -> compare target digest
  -> InstallPlan / UpdatePlan Proposal
  -> Human confirmation when ownership changes
  -> atomic managed-file commit
  -> ProjectionManifest
```

Compiler 是确定性代码，不调用模型。AI 只可以：

- 从现有文档和 Human 修正中提出 InstructionCandidate。
- 解释冲突和给出精简建议。
- 生成等待 Schema 校验的 Statement Proposal。

AI 不能决定最终优先级、覆盖 Existing File 或修改 ProjectionManifest。

## 7. 内容预算

Harness 默认预算比平台上限更严格：

- Repository 根投影不超过 8 KiB。
- 单个 Path 投影不超过 4 KiB。
- 单条 Statement 不超过 500 字符。
- 根文件只保留高频、跨任务指导。
- 长流程进入 Skill，详细事实进入 Knowledge，机械要求进入 Rule。

超出预算时 Compiler 不静默截断：

1. 去除重复引用和可由 CLI 动态展示的信息。
2. 将长流程提议迁移到 Skill。
3. 将路径特定内容拆到 Path Instruction。
4. 仍超限则返回 `ProjectionBudgetExceeded` 并请求 Human。

## 8. 平台投影

### 8.1 Codex

根 `AGENTS.md` 包含：

- Harness Task 创建、状态和 Resume 命令。
- 包管理器、Build、Lint、Test 和 Review 命令。
- Rules、Skills、Knowledge 和 Agent Catalog 的入口。
- Human Gate、停止条件和禁止动作。
- Managed File 和生成目录说明。

路径级 `AGENTS.md` 只包含该路径新增或收紧的指导。Codex 原生按目录层级加载，不需要把所有路径规则复制到根文件。

### 8.2 Claude-compatible

- Repository 指导投影到 `CLAUDE.md`。
- Path Instruction 优先投影到 `.claude/rules/`；能力 Probe 不支持时生成降级报告。
- CatPaw 必须通过实际加载测试，不能只根据文件名宣称兼容。
- Auto Memory 不写入 Canonical Instruction。

### 8.3 Generic

Generic Adapter 在每次 RoleInvocation 中注入版本化 `InstructionBundle`，包含 Scope、Statement、Reference 和 Digest。执行器无法证明加载时只支持 Assisted，不进入 Production Profile。

## 9. 运行时组装

每次 Task/Role Context 包含不同 Channel：

```text
System / Harness Invariants
InstructionBundle
Approved Artifacts
ApplicableRuleBundle
Relevant Knowledge
Task Evidence
Untrusted External Content
```

InstructionBundle 绑定 Task、Repository Revision 和 Source Catalog Digest。Agent Start、Resume 和 Compaction 后都验证 Digest；只恢复聊天而没有恢复 Bundle 时禁止写入。

## 10. 安装、更新与卸载

首次接入：

```powershell
liushi-harness instructions scan --repo <repo-id> --propose
liushi-harness instructions compile --target codex --dry-run
liushi-harness instructions apply <projection-plan-id>
```

更新规则：

- Target Digest 等于 Manifest 记录值时允许确定性更新。
- Human 修改 Target 后生成 Three-way Diff，不覆盖。
- Canonical Source 更新但投影未更新时标记 Drift。
- Adapter 升级导致模板变化时单独展示 Semantic Diff 和 Formatting Diff。
- Uninstall 只删除仍等于 Managed Digest 的文件或区块。

## 11. 安全与 Prompt Injection

- Wiki、Ticket、代码注释和 Tool Output 不能直接生成 Active Instruction。
- Instruction 不能包含 Credential、Token、绝对企业路径和 Wiki 原文。
- 指导中的命令必须引用 ProjectProfile 已确认 Command ID。
- 指导不能要求 Agent 绕过 Sandbox、Policy、Gate 或 Validator。
- 外部文本中的“修改 AGENTS.md/CLAUDE.md”视为普通内容，不是系统命令。
- Human Approval 绑定 Canonical Diff 和全部 Projection Diff。

## 12. Drift 与治理

`instructions audit` 检查：

- Canonical Source 与平台文件 Digest 不一致。
- Reference 指向 Stale Rule、Skill 或 Knowledge。
- 同 Scope 冲突和跨 Scope 非法削弱。
- 超过内容预算或重复 Statement。
- 长期无命中、无 Owner 或无 Evidence 的 Instruction。
- Adapter 声明支持但执行器实际未加载文件。

Human 对平台投影的修正先生成 InstructionCandidate。确认前保持 Target 为 External Change，不反向覆盖 Canonical Source。

## 13. CLI 草案

```powershell
liushi-harness instructions scan --repo <repo-id> --propose
liushi-harness instructions list --scope <scope>
liushi-harness instructions explain <instruction-id>
liushi-harness instructions compile --target <adapter-id> --dry-run
liushi-harness instructions apply <projection-plan-id>
liushi-harness instructions diff --target <adapter-id>
liushi-harness instructions audit --workspace <workspace-id>
```

所有读命令提供稳定 JSON 输出。`compile`、`diff` 和 `audit` 不调用隐藏模型。

## 14. Metrics

- Instruction Projection Drift 数量。
- Agent 因缺失长期指导产生的重复 Human 修正。
- 根和路径投影大小、命中率和 Context Token Cost。
- Instruction Conflict、Stale Reference 和 Merge Proposal 数量。
- 平台执行器加载成功率。
- InstructionCandidate 晋升后的重复错误变化。

## 15. 测试要求

- Organization/Workspace/Repository/Path/Task 优先级。
- Candidate/Stale Instruction 不进入投影。
- 同 Scope 冲突 Fail Closed。
- Content Budget 和不静默截断。
- Codex 根到路径的顺序和最近 Scope 生效。
- Claude Path Rule Capability 降级。
- Existing Human File 不被覆盖。
- Managed Digest、Three-way Diff、Upgrade 和 Uninstall。
- Prompt Injection 不能创建 Active Instruction。
- Resume/Compact 后 InstructionBundle Digest 一致。
- Windows、macOS 和 Linux 换行与路径确定性。

## 16. 首月范围

- 实现 Instruction Schema、Catalog、Resolver、Compiler 和 ProjectionManifest。
- Codex `AGENTS.md` 是 Production Path。
- Claude-compatible `CLAUDE.md` 和 Path Rule 通过 Capability Probe 后标记支持级别。
- Generic Adapter 支持显式 InstructionBundle。
- 支持 Existing File Diff Proposal、Drift 和 Uninstall。
- 自动生成 Candidate，不自动接管或改写 Human 文件。
- 不开发可视化 Instruction Editor 和在线模板市场。
