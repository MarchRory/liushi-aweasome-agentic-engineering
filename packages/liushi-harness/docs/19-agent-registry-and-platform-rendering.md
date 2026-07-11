# 19 Agent Registry 与平台配置生成

## 1. 目标

Agent Role 只描述“需要哪类判断力”，还不足以投入生产。Harness 必须进一步定义每个 Agent 使用什么模型策略、能读取什么、能调用什么、输出什么以及如何验证。

Agent Registry 子系统负责：

- 用平台无关 `AgentDefinition` 保存 Agent Contract。
- 将 Role、Model、Permission、Tool、Skill、Context、Memory 和 Eval 绑定为一个版本。
- 按 Executor Capability 生成 Codex、Claude-compatible 或 Generic 配置。
- 确保平台文件只是受管理投影，不成为业务工作流真源。
- Agent 配置变化触发 Regression Eval 和 Human Promotion。
- 缺少隔离、权限或结构化输出能力时显式降级。

Codex 支持项目级 `.codex/agents/*.toml`，自定义 Agent 可以配置模型、Reasoning、Sandbox、MCP 和 Skill，并由 `.codex/config.toml` 控制并发和嵌套深度。[Codex Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)

Claude Code 使用项目级 Subagent 定义配置 Prompt、Tool、Permission、Skill 和 Hook；背景 Agent 无法获得新权限时会失败而不是等待 Human。[Claude Code Subagents](https://code.claude.com/docs/en/sub-agents)

## 2. 概念边界

| 概念                | 含义                                  | 生命周期          |
| ------------------- | ------------------------------------- | ----------------- |
| Agent Role          | 领域职责，如 Context Scout            | Harness Version   |
| AgentDefinition     | Role 的可执行配置 Contract            | Versioned、可晋升 |
| AgentInstance       | 某次 Task 中解析后的 Agent 实例       | Task/Invocation   |
| RoleInvocation      | 一次有输入、权限和输出 Schema 的调用  | Invocation        |
| Platform Projection | `.toml`、`.md`、Settings 等生成文件   | Adapter Version   |
| Orchestrator        | 保持 Human 对话和端到端责任的主 Agent | Task Session      |

边界要求：

- Role 不直接等于平台 Subagent 文件。
- AgentDefinition 不保存 Approval、Task State 或长期 Memory 内容。
- Model 使用 ModelPolicy Reference，不把“当前 SOTA”永久写死在 Skill Prompt。
- Skill 描述流程；AgentDefinition 只声明允许加载哪些 Skill。
- Tool/MCP 声明是 Allowlist，不表示 Harness Policy 自动允许调用。
- 平台 Permission 更宽松时仍受 Harness Gate、Sandbox 和 Write Set 约束。

## 3. Canonical Contract

```ts
/** AgentDefinition 从创建到下线的生命周期。 */
export enum AgentLifecycleStatus {
  /** 正在编写，不能进入 Executor Projection。 */
  Draft = "draft",
  /** 已形成候选并等待 Capability 和 Eval。 */
  Candidate = "candidate",
  /** 已通过 Human Promotion，可以在声明 Scope 内使用。 */
  Active = "active",
  /** Human 或 Policy 临时停用，但保留历史引用。 */
  Disabled = "disabled",
  /** 已由新 AgentDefinition 替代。 */
  Deprecated = "deprecated",
}

/** Agent 在 Harness Runtime 中采用的执行形态。 */
export enum AgentExecutionMode {
  /** 作为与 Human 交互并负责编排的主 Session。 */
  PrimarySession = "primary_session",
  /** 作为隔离 Context 中运行的受限 Subagent。 */
  IsolatedSubagent = "isolated_subagent",
  /** 通过一次非交互 Executor 调用模拟受限角色。 */
  NonInteractiveRole = "non_interactive_role",
  /** 只生成 Prompt 和配置供 Human 手动运行。 */
  ManualHandoff = "manual_handoff",
}

/** Agent 可以获得的 Context 隔离级别。 */
export enum AgentContextIsolation {
  /** 主 Agent 保留完整 Human 对话和 Task Context。 */
  TaskPrimary = "task_primary",
  /** 只注入 Role 所需的最小 ContextBundle。 */
  MinimalScoped = "minimal_scoped",
  /** 使用新鲜只读 Context，不继承实现结论。 */
  FreshReadOnly = "fresh_read_only",
  /** 平台无法证明隔离，只能由 Human 手动运行。 */
  Unverified = "unverified",
}

/** Agent 对 Harness Memory 的最大访问能力。 */
export enum AgentMemoryAccess {
  /** Agent 不读取或生成任何 Memory 内容。 */
  None = "none",
  /** Agent 可以读取 Context Assembler 选择的 Active Knowledge。 */
  ReadScoped = "read_scoped",
  /** Agent 可以读取并生成 MemoryCandidate Proposal。 */
  ProposeCandidate = "propose_candidate",
}

/** Agent 无法按首选执行形态运行时允许的降级策略。 */
export enum AgentFallbackMode {
  /** 缺少能力时立即停止并返回 DecisionRequest。 */
  FailClosed = "fail_closed",
  /** 允许转为等价的非交互 RoleInvocation。 */
  NonInteractive = "non_interactive",
  /** 只输出可审阅 Prompt，由 Human 决定是否运行。 */
  Manual = "manual",
}

/** 一个可解析、可投影并可评估的 Agent 配置。 */
export interface AgentDefinition {
  /** 跨平台稳定的 Agent ID。 */
  agentId: string;
  /** Agent Contract 的语义版本。 */
  version: string;
  /** 当前生命周期状态。 */
  status: AgentLifecycleStatus;
  /** Agent 实现的 Canonical Role ID。 */
  roleId: BuiltInAgentRole | RegisteredAgentRoleId;
  /** Human 和 Orchestrator 用于选择 Agent 的精确描述。 */
  description: string;
  /** Agent 默认采用的执行形态。 */
  executionMode: AgentExecutionMode;
  /** Agent 所需的 Context 隔离级别。 */
  contextIsolation: AgentContextIsolation;
  /** Agent 允许的最大 Memory 访问能力。 */
  memoryAccess: AgentMemoryAccess;
  /** 缺少首选平台能力时允许的降级方式。 */
  fallbackMode: AgentFallbackMode;
  /** 动态解析实际模型和 Reasoning 的 Policy ID。 */
  modelPolicyId: string;
  /** Harness Permission Profile ID。 */
  permissionProfileId: string;
  /** Agent 可以调用的 Canonical Tool ID。 */
  toolIds: string[];
  /** Agent 可以连接的 MCP/Connector Capability ID。 */
  connectorIds: string[];
  /** Agent 启动时允许加载的 Skill ID。 */
  skillIds: string[];
  /** Agent 接受的正式 Artifact Type。 */
  inputArtifactTypes: ArtifactType[];
  /** Agent 输出 Proposal 必须满足的 Schema ID。 */
  outputSchemaId: string;
  /** Context 选择、Budget 和 Channel Policy ID。 */
  contextPolicyId: string;
  /** Agent 可以运行的最大秒数。 */
  timeoutSeconds: number;
  /** Schema Repair 之外允许的最大重试次数。 */
  maxRetries: number;
  /** 同类 Agent 的并发和互斥策略 ID。 */
  concurrencyPolicyId: string;
  /** Agent 运行前必须满足的 Gate ID。 */
  requiredGateIds: string[];
  /** Agent 晋升和模型更新必须运行的 Eval Suite ID。 */
  evalSuiteId: string;
  /** 平台无法从 Canonical 字段表达时使用的受限 Override。 */
  platformOverrides: AgentPlatformOverride[];
}
```

`AgentPlatformOverride` 必须由 Adapter Schema 校验，只允许表达平台差异；不能覆盖 Role、Gate、Permission、Memory Access 和 Output Schema。

## 4. Registry 目录

Harness 内置定义：

```text
packages/liushi-harness/config/agents/
├── catalog.yaml
├── orchestrator/
│   ├── agent.yaml
│   ├── instructions.md
│   └── evals/
├── context-scout/
├── solution-risk-reviewer/
├── independent-verifier/
└── learning-curator/
```

项目扩展：

```text
<repo>/.liushi-harness/agents/
├── index.yaml
├── overrides/
└── custom/
    └── <agent-id>/
        ├── agent.yaml
        ├── instructions.md
        └── evals/
```

生成投影：

```text
<repo>/.codex/config.toml
<repo>/.codex/agents/*.toml
<repo>/.claude/settings.json
<repo>/.claude/agents/*.md
<runtime>/generated/agents/<adapter-id>/manifest.json
```

目录要求：

- `agent.yaml` 只保存结构化 Contract。
- `instructions.md` 只保存该 Role 特有的行为，不复制 AGENTS、Rule 和 Skill。
- Eval Fixture 与 AgentDefinition 同版本维护。
- 平台投影登记 Managed Ownership 和 Source Digest。
- 企业 Agent 可以存在于私有 Extension Package，不进入开源包。

## 5. 首月内置 Agent

| Agent                  | Mode              | Permission         | Memory            | 核心输出                                 |
| ---------------------- | ----------------- | ------------------ | ----------------- | ---------------------------------------- |
| Orchestrator           | Primary Session   | Approved Write Set | Read Scoped       | Requirement/Plan/Implementation Proposal |
| Context Scout          | Isolated Subagent | Read-only          | Read Scoped       | Claim + EvidenceRef                      |
| Solution Risk Reviewer | Isolated Subagent | Read-only          | Read Scoped       | PlanRisk Finding                         |
| Independent Verifier   | Fresh Read-only   | Read-only          | Read Scoped       | Verification Finding                     |
| Learning Curator       | Isolated Subagent | Proposal-only      | Propose Candidate | Learning/MemoryCandidate                 |

首月不提供通用 Implementer Subagent。Implementation 由 Orchestrator 在冻结 Write Set、RuleBundle 和 Gate 内执行，减少 Plan 与 Human 决策在多次 Handoff 中丢失。

Orchestrator 虽然进入 Registry，但不会被自己递归 Spawn；Adapter 将其配置投影为主 Session Model、Instruction、Permission 和 Runtime Policy。

## 6. Agent Resolution

```text
Role requirement
  -> Active Agent Registry
  -> task phase and risk
  -> required input artifacts
  -> executor capability
  -> permission and connector availability
  -> model policy resolution
  -> eval-approved candidate
  -> resolved AgentInstance + digest
```

规则：

- Hard Deny、Gate 和 Permission 先于 Agent Description。
- Orchestrator 可以在 Eligible Agent 中选择，但不能绕过确定性过滤。
- 高风险 Plan 和 Verification 必须使用已声明 Role，不能临时生成无 Contract Agent。
- 多个 Agent 同等匹配且会改变保证时生成 DecisionRequest。
- `Disabled`、`Deprecated`、未通过 Eval 和 Capability Missing 的 Agent 不进入候选。
- AgentInstance 绑定 Definition、ModelPolicy、Instruction、Skill、RuleBundle 和 Context Digest。

## 7. Model Policy

- Canonical AgentDefinition 只引用 ModelPolicy ID。
- Orchestrator 固定 Frontier Tier，实际模型由当前 Eval-approved Mapping 解析。
- 子角色根据风险使用 Frontier、Balanced 或 Fast Tier。
- Adapter 启动后校验实际模型身份，不能只记录请求值。
- Model 或 Reasoning 变化会生成新的 Resolved AgentInstance Digest。
- 顶层 Frontier 不可用时进入 `WAITING_HUMAN`，不静默降级。
- Claude 系列模型继续受默认 Deny Policy；Claude-compatible 仅表示配置协议兼容。

## 8. Permission 与 Tool Surface

Permission 使用交集：

```text
Harness Role Maximum
  intersect Task Read/Write Set
  intersect Agent Permission Profile
  intersect Executor Sandbox
  intersect Tool/Connector Allowlist
  intersect Current Gate Decisions
```

任何一层更严格都必须保留。要求：

- Context Scout、Risk Reviewer、Verifier 和 Learning Curator 默认只读项目文件。
- Learning Curator 只能写 Proposal Store，不能写 Knowledge、Rule、Skill 或 Wiki。
- Agent 未声明的 MCP/Connector 不进入 Tool Surface。
- Background Agent 需要 Human Permission 时失败返回，不升级权限。
- Shell Tool 仍经 PreAction、Command Policy 和 Action Journal。
- Agent Prompt 中的 Tool 名称不授予工具权限。

## 9. Context 与 Memory

每个 AgentDefinition 声明 ContextPolicy 和 MemoryAccess：

- Orchestrator：读取当前 Task 全部批准 Artifact、适用 Rule 和 Scoped Knowledge。
- Context Scout：读取授权 Read Set、路由索引和最小历史 Evidence。
- Risk Reviewer：读取 Requirement、Plan、Business Contract、Rule 和影响面。
- Verifier：读取正式 Artifact、Diff、Evidence 和不变量，不读取 Implementer 隐藏推理。
- Learning Curator：读取已完成 Task、Human Correction 和 Candidate Index，只输出 Proposal。

Agent 不能直接调用平台 Memory 写入 Harness Memory。平台记忆提供的 Claim 被标记为 Untrusted Recall，并重新走 Evidence 采集。

## 10. Skill 绑定

Skill 与 Agent 的关系：

- Skill Manifest 声明可以被哪些 Role 使用。
- AgentDefinition 声明启动时允许加载的 Skill ID。
- Runtime 取两者交集，并验证 Skill Status、Version 和 Eval。
- Skill 中的 Script 仍受 Agent Tool、Permission 和 Gate 限制。
- Agent 未预加载 Skill 时可以提出 SkillInvocation Proposal，由 Orchestrator/CLI 校验后加载。
- 平台原生 Skill 注入不改变 Harness Canonical Skill Version。

首月推荐绑定：

- Context Scout：`harness-onboard`、`workspace-sync` 的只读步骤。
- Risk Reviewer：`plan-risk`、`business-logic-contract`。
- Verifier：`verify-evidence`、`project-rules`。
- Learning Curator：`learning-candidate`、`memory-curator`。

## 11. Codex Projection

Codex Adapter 生成：

```text
.codex/config.toml
.codex/agents/context-scout.toml
.codex/agents/solution-risk-reviewer.toml
.codex/agents/independent-verifier.toml
.codex/agents/learning-curator.toml
```

映射：

- `[agents]`：并发、深度和 Worker Timeout。
- `name/description/developer_instructions`：Agent Identity 和 Role Instruction。
- `model/model_reasoning_effort`：Resolved Model Policy Projection。
- `sandbox_mode`：Permission Profile 的平台下界。
- `mcp_servers`、`skills.config`：经过 Allowlist 的能力。

首月设置 `max_depth = 1`，禁止 Subagent 递归委派；`max_threads` 由 Workspace Concurrency Policy 控制，不直接采用平台最大值。

Project-scoped `.codex/` 配置只在 Trusted Project 中加载，因此 `doctor` 必须验证实际 Trust 和 Agent Discovery。无法验证时降级 Assisted。

## 12. Claude-compatible Projection

Claude-compatible Adapter 生成：

```text
.claude/settings.json
.claude/agents/context-scout.md
.claude/agents/solution-risk-reviewer.md
.claude/agents/independent-verifier.md
.claude/agents/learning-curator.md
```

Frontmatter/Settings 映射：

- Name、Description 和 Role Prompt。
- Tool Allowlist/Denylist。
- Permission Mode。
- Preloaded Skills。
- Agent Start/Stop Hook。
- 模型字段仅在 ModelPolicy 和 CatPaw Capability 明确允许时生成。

CatPaw 必须通过：

- 文件发现和 Description Routing。
- Tool/Permission Negative Test。
- Skill Preload 和 Context Isolation。
- Structured Output 或 Proposal Parser。
- Background Permission Failure。

未通过的字段记录到 Capability Override，不能假设与 Claude Code 完全等价。

## 13. Generic Projection

执行器没有 Custom Agent 时：

1. Harness 根据 AgentDefinition 生成一次性 RoleInvocation。
2. 使用独立非交互进程和最小 ContextBundle。
3. Tool Surface 由 Harness CLI/Sandbox 限制。
4. 结果按 Proposal Schema 解析。
5. 无法证明只读或隔离时转为 Manual Handoff。

Generic Adapter 不创建虚假的 Agent 配置文件，也不宣称支持 Background/Subagent。

## 14. Agent Authoring 与 Promotion

```powershell
liushi-harness agents create <agent-id> --from-role <role-id> --dry-run
liushi-harness agents validate <agent-id>
liushi-harness agents evaluate <agent-id> --suite <eval-id>
liushi-harness agents promote <agent-id> --dry-run
```

Promotion 要求：

- 清晰 Trigger 和 Non-trigger。
- 输入 Artifact、输出 Schema 和至少一个 Negative Fixture。
- 最小 Tool/Connector/Skill Allowlist。
- Permission Escape 和 Prompt Injection 测试。
- Model Tier 和 Fallback Eval。
- Context/Memory 污染测试。
- Human 通过 G7 并确认全部平台 Projection Diff。

Agent 改进不能只修改 Prompt 后直接覆盖 Active Version。Definition、Instruction、ModelPolicy、Skill 或 Permission 任一变化都生成 Candidate Version。

## 15. Agent Runtime

```text
resolve AgentDefinition
  -> validate Artifact/Gate
  -> resolve Model and Adapter
  -> intersect permissions
  -> assemble Context/Instruction/Rule/Memory
  -> record AgentInstance digest
  -> AgentStart Hook
  -> invoke executor
  -> AgentStop Hook
  -> parse Proposal Schema
  -> independent CLI validation
  -> commit Proposal or return failure
```

AgentStop 只允许一次 Schema Repair。第二次失败返回 `InvalidOutput`，不能保存部分 JSON 或从自然语言猜字段。

## 16. 并发与多 Agent

- 首月最大嵌套深度为 1。
- 只读探索、验证和文档调查可以并行。
- 同一 Repository 同时最多一个写 Agent，首月由 Orchestrator 持有。
- 并行 Agent 不共享可变 Working Memory，只通过 Proposal/Evidence 汇合。
- Human 等待时停止依赖该决策的 Agent，不让其继续猜测。
- Agent 冲突不使用多数投票决定业务事实。
- Token、Wall Time 和并发预算由 Workspace Policy 限制。

## 17. Drift、升级与卸载

`agents audit` 检查：

- Canonical Definition 与平台投影 Digest。
- Model、Tool、Skill、MCP 和 Permission Capability 漂移。
- Active Agent 缺少 Eval、Owner 或 Output Schema。
- Platform Override 覆盖禁止字段。
- Agent 长期无命中、总是失败或总需 Human 修正。
- Existing Human Agent File 和 Managed Ownership 冲突。

升级/卸载遵循 Managed File 协议。Human 修改平台 Agent 后只生成 AgentCandidate/Diff，不反向自动覆盖 Canonical Definition。

## 18. CLI 草案

```powershell
liushi-harness agents list --workspace <workspace-id>
liushi-harness agents explain <agent-id>
liushi-harness agents resolve --task <task-id> --role <role-id>
liushi-harness agents render --target <adapter-id> --dry-run
liushi-harness agents apply <render-plan-id>
liushi-harness agents probe --target <adapter-id>
liushi-harness agents evaluate <agent-id> --suite <eval-id>
liushi-harness agents audit --workspace <workspace-id>
```

`list`、`explain`、`resolve`、`render` 和 `audit` 提供稳定 JSON。模型调用只发生在显式 RoleInvocation 或 Eval，不隐藏在 Renderer 中。

## 19. Metrics

- Agent Task Success、Critical Miss 和 Invalid Output。
- 每个 Role 的调用量、延迟、Token 和成本。
- Capability Missing、Fallback 和 Manual Handoff。
- Tool/Permission Denial 和越权尝试。
- Context/Memory Token Cost 与污染 Finding。
- Human 修正、Rework 和 Agent 冲突。
- Agent Version/Model/Skill 变化前后的 Regression。
- 平台投影 Drift 和 Discovery 成功率。

## 20. 测试要求

- AgentDefinition Schema、String Enum、TSDoc 和 Digest。
- Disabled/Deprecated/未 Eval Agent 不进入 Resolution。
- Permission/Tool/MCP/Skill 交集和负向测试。
- MemoryAccess 与 Learning Curator Proposal-only。
- Orchestrator 不可递归 Spawn。
- Frontier 不可用不静默降级。
- Codex TOML、Claude Markdown/Settings 和 Generic Invocation Fixture。
- Project Trust、Agent Discovery 和 Capability Probe。
- Background Permission Failure。
- AgentStart/Stop、Timeout、Interrupt 和 Schema Repair 一次。
- Existing Human File、Managed Digest、Upgrade 和 Uninstall。
- Prompt Injection 不能修改 AgentDefinition 或 Tool Allowlist。
- 多 Agent 并发、冲突、预算和 Depth=1。

## 21. 首月范围

- 实现 AgentDefinition、Registry、Resolver、AgentInstance 和 ProjectionManifest。
- Codex Custom Agent 是 Production Path。
- Claude-compatible/CatPaw 通过真实 Probe 后按能力声明支持。
- Generic NonInteractive Role 作为可移植降级路径。
- 内置五个 Agent，禁止通用 Agent Team 和嵌套委派。
- 实现 Model、Permission、Tool、Skill、Context 和 Memory 绑定。
- Agent Candidate 自动生成，Active Version 必须 G7 Promotion。
- 不开发在线 Agent Marketplace、动态自复制 Agent 或 Agent 自主修改权限。
