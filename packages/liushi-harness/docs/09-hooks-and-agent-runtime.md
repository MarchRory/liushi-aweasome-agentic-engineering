# 09 Hooks 与 Agent Runtime

## 1. 目标

Hooks 将 Harness 的确定性规则接入执行器生命周期；Agent Runtime 将需要判断力的工作分配给受限角色。两者必须遵守：

- Hook 调用确定性 CLI，不复制 Policy 或状态机实现。
- Agent 生成 Proposal，不直接提交 Artifact、Approval 或长期知识。
- Orchestrator 保留 Human 对话和端到端责任，不建立无边界 Agent 集群。
- 平台缺少 Hook 或 Subagent 时使用显式降级流程。
- Hook 并发、失败和重入行为必须可测试、可恢复。
- Agent Role 是领域职责，具体 Model、Permission、Tool、Skill、Context 和 Memory 由 Active AgentDefinition 解析。

### 1.1 当前实现状态

**状态：S1/S2、停止在 CheckpointBound 的 S3 Closeout，以及 Human-gated Recovery Composition Root/CLI 已实现，整体仍部分实现。** 当前代码已提供版本化 Canonical Hook Event、严格 PreAction/PostAction Payload、Command Envelope 摘要绑定、Action Hook 授权策略和 Dispatcher。S2 进一步提供 Session Hook Binding v2、Admission State/File Store 和非等待跨进程 Lease；Activation 会自动初始化 Binding/State。PreAction 在同一 Lease 内复验 Activation、Binding、Runtime Provenance、权威 PlanRisk/G2/G4/Write Set，先写入 `pending`，再提交健康 v2 Intent，最后提交 `admittedActionIds`；任一失败均 fail closed，持久化不确定时为 `outcome_unknown`。PostAction 允许 `waiting_agent` 或 `closing` 中已准入 Action，复验 v2 Intent，写入 Trace、绑定 Trace 摘要的 v2 Observation 与受其因果绑定的 Resolution，并支持重放幂等。S3 的 `CodingTaskSessionCloseoutManager`、生产 CLI 和真实 Git E2E 已完成 Action Coverage、Snapshot、唯一 ChangeSet-bound Checkpoint 与跨 Application 幂等重放。Recovery 故障注入与真实 Git E2E、Submission/Verification/PRReady 串联、真实 Codex TUI 项目 Pilot、其他平台 Projection、Role Runtime 和 Human Battle Runtime 尚未实现。

Workflow、Cell、Agent、Skill、Executor 与 Hook 的职责边界已经在 [21 需求生命周期 Workflow Runtime](./21-requirement-workflow-runtime.md) 中建立；本章后续只定义 Hook 映射和 Agent Runtime，不拥有 Workflow 状态。

## 2. Canonical Hook Event

```ts
/** Harness 定义并由各 Executor Adapter 映射的生命周期事件。 */
export enum HarnessHookEvent {
  /** Executor Session 创建、恢复或清理后开始。 */
  SessionStart = "session_start",
  /** Human Prompt 进入模型上下文之前。 */
  UserPromptSubmit = "user_prompt_submit",
  /** Executor 准备调用命令、写文件或 MCP Tool 之前。 */
  PreAction = "pre_action",
  /** Executor 已完成命令、文件或 MCP Tool 调用之后。 */
  PostAction = "post_action",
  /** Executor 准备压缩或裁剪上下文之前。 */
  PreCompact = "pre_compact",
  /** Executor 完成上下文压缩之后。 */
  PostCompact = "post_compact",
  /** 受限 Agent Role 开始运行之前。 */
  AgentStart = "agent_start",
  /** 受限 Agent Role 准备返回结果时。 */
  AgentStop = "agent_stop",
  /** 顶层 Executor 准备结束当前 Turn 时。 */
  TurnStop = "turn_stop",
}

/** Canonical Hook Handler 对执行器后续行为的要求。 */
export enum HookDecision {
  /** Hook 检查通过，允许执行器继续。 */
  Allow = "allow",
  /** Hook 没有决定权，交回执行器正常权限流程。 */
  Defer = "defer",
  /** 当前动作违反 Policy 或缺少 Gate，必须阻止。 */
  Deny = "deny",
  /** 当前 Turn 或 Agent 尚未满足完成条件，需要继续一次。 */
  Continue = "continue",
  /** Hook 自身失败，必须按 Event Failure Policy 处理。 */
  Error = "error",
}
```

Canonical Event 不追求覆盖所有平台事件，只包含 Harness 有稳定语义的共同生命周期。平台专属事件可以作为 Adapter Enhancement，不能改变 Core 不变量。

## 3. Hook Command

目标平台 Hook 最终执行：

```text
liushi-harness hook handle --executor codex
```

输入通过 Stdin JSON 提供，输出使用版本化 JSON Schema。Hook Wrapper 只负责：

- 将平台字段映射为 Canonical Hook Input。
- 注入 `PLUGIN_ROOT`、Workspace 和 Task 解析信息。
- 调用 CLI 并将 HookDecision 映射回平台响应。

Wrapper 不读取或修改 Store，不包含风险正则和业务规则。Rule Resolution 和 Compliance 由 CLI Core 执行，Wrapper 只传递 Canonical Input 和 Decision。

当前实现提供三个明确边界：`hook bind` 将精确的已审批 PlanRisk 绑定到仓库或公共层根目录，`hook config --executor codex` 只向 stdout 输出可审阅的 `hooks.json`，`hook handle --executor codex` 从 stdin 读取 Codex 原生 Hook JSON 并只向 stdout 输出平台原生响应。配置文件写入、项目受信任和撤销由 Human 控制，Wrapper 不自动修改项目文件。

当前 Adapter 仅覆盖 `apply_patch`，并使用 Codex 的 `command` Handler。Codex 官方文档说明 PreToolUse 对部分工具的拦截能力仍有限，PostToolUse 也不能撤销已经发生的副作用，因此 Hook 不是完整安全边界；CLI、Sandbox、Git 和 CI 必须继续复用同一 Policy Engine。[Codex Hooks](https://learn.chatgpt.com/docs/hooks)

Codex Wrapper 严格接收官方 PreToolUse/PostToolUse Schema，包括必填的 `transcript_path`，以及 Code Mode 等嵌套宿主可选提供的 `agent_id`、`agent_type`。当事件已可识别但 Adapter 返回失败或抛出异常时，Wrapper 不依赖普通非零退出码：PreToolUse 以退出码 0 返回结构化 `permissionDecision=deny`，PostToolUse 以退出码 0 返回 `decision=block`，防止宿主继续动作或让 Agent 错报成功。只有 stdin 无法解析或事件不可识别时，才写入 stderr 并返回拒绝退出码。

## 4. 平台事件映射

| Canonical        | Codex                             | Claude-compatible                   |
| ---------------- | --------------------------------- | ----------------------------------- |
| SessionStart     | `SessionStart`                    | `SessionStart`                      |
| UserPromptSubmit | `UserPromptSubmit`                | `UserPromptSubmit`                  |
| PreAction        | `PreToolUse`、`PermissionRequest` | `PreToolUse`、`PermissionRequest`   |
| PostAction       | `PostToolUse`                     | `PostToolUse`、`PostToolUseFailure` |
| PreCompact       | `PreCompact`                      | `PreCompact`                        |
| PostCompact      | `PostCompact`                     | Adapter Capability 决定             |
| AgentStart       | `SubagentStart`                   | `SubagentStart`                     |
| AgentStop        | `SubagentStop`                    | `SubagentStop`                      |
| TurnStop         | `Stop`                            | `Stop`                              |

Codex 当前并非所有 Tool Path 都可由 PreToolUse 拦截，而且多个匹配 Hook 可能并发，因此 CLI、Sandbox、Git 和 CI 必须重复执行同一 Policy Engine。[Codex Hooks](https://learn.chatgpt.com/docs/hooks)

Claude-compatible 的命令、Prompt、Agent、HTTP 等扩展 Hook 只有 Command Hook 属于初始版本 Core 共同子集。[Claude Code Hooks](https://code.claude.com/docs/en/hooks-guide)

## 5. Event Failure Policy

| Event            | Handler 失败                          | 原因                                |
| ---------------- | ------------------------------------- | ----------------------------------- |
| SessionStart     | 显示警告；Implementation 保持锁定     | 允许诊断，但不能在无 Context 下写入 |
| UserPromptSubmit | Prompt 可继续；不能提交 Requirement   | 不阻断普通问答                      |
| PreAction R0     | Defer 并记录缺失观测                  | 只读低风险                          |
| PreAction R1-R4  | Fail Closed                           | 风险动作不得绕过 Gate               |
| PostAction       | 标记 Evidence 不完整并暂停后续 Commit | 副作用可能已经发生                  |
| PreCompact       | 尝试 Snapshot；失败时阻止自动压缩     | 防止丢失恢复点                      |
| AgentStart       | 不启动 Role                           | 权限和 Context 未确认               |
| AgentStop        | 最多重试一次 Schema Repair            | 防止无限 Agent Loop                 |
| TurnStop         | 最多继续一次，然后返回未完成原因      | 防止 Stop Hook 无限循环             |

Failure Policy 是 Harness Policy，平台映射不能自行改成 Fail Open。

Codex 的普通 Hook 进程失败不能被当作可靠拦截证据。PreAction 风险路径必须获得结构化拒绝结果；PostAction 已经无法撤销副作用，结构化 `block` 只负责中断后续模型循环并把现场交回 Human。

Rule 相关 Hook 行为固定为：

- `SessionStart` 加载已提交的 ApplicableRuleBundle Digest、适用规则摘要和项目机制引用。
- `PreAction` 校验目标路径、Write Set、Blocking Rule 前置条件和有效 Rule Exception。
- `PostAction` 记录受影响 Rule ID，并运行可增量执行的 Validator；失败时阻止 Artifact Commit。
- `AgentStart` 将同一 RuleBundle Digest 注入 RoleInvocation，禁止角色自行选择规则版本。
- `TurnStop` 检查未处理的 Blocking Violation 和 G8 DecisionRequest。

Hook 不是唯一执行点；相同检查必须能由显式 CLI、Git Hook 和 CI 复现。

## 6. 并发与重入

- 每次 Hook 生成 `hookExecutionId` 和幂等键。
- 同一平台并发触发的 Hook 可以同时读取，但提交状态时竞争 Task Lock。
- 后到的重复事件如果 Input Digest 一致，直接返回已提交结果。
- Hook Handler 不等待模型，不进行长测试，不持有长期锁。
- PostAction 先写 Observation，再由异步 CLI 步骤整理完整 Evidence。
- Hook 超时后 Executor Adapter 必须记录不确定状态，不能当作检查通过。

### 6.1 Session Action Admission 实际状态

S2 的 Session Action Admission 已将上述原则落到可恢复的状态协议：

- `waiting_agent` 允许新的 PreAction 竞争同一 Session Lease；`closing` 拒绝新的 PreAction，但允许已经准入的 Action 完成 PostAction。
- PreAction 在 Lease 内复验 Activation、Session Hook Binding v2、Runtime Provenance、PlanRisk/G2/G4 和 Write Set；Admission State 先进入 `pending`，只有健康 v2 Intent 提交成功后才把 Action ID 追加到 `admittedActionIds`。
- `pending`、缺失 PostAction、`WaitingHuman`、`RetryPermitted` 或 `outcome_unknown` 都会阻止 `beginClosing`。S3 Process Manager 会在 Repository Lock 内驱动 Action/Trace Coverage、Snapshot 和 Checkpoint，并由生产 CLI 停在 `CheckpointBound`；Verification 与 PRReady 仍属于后续阶段。
- PostAction 必须复验对应 v2 Intent，再记录 Trace、绑定 Trace 摘要的 v2 Observation 和受其因果绑定的 Resolution；重复投递按稳定 Action/Intent 身份幂等重放。Trace 恢复证据、Observation 或 Resolution 提交不健康时，Session 从 `waiting_agent` 或 `closing` 进入 `outcome_unknown`。
- Codex `tool_response` 没有跨工具统一的成功字段；Adapter 只把显式成功证据归为 `succeeded`，显式失败证据归为 `failed`，空值、空对象或未识别结构统一归为 `outcome_unknown` 并进入 `human_required`。
- Lease 竞争、重入、状态复验或持久化结果不确定时均不放行；无法证明结果时保持 fail-closed 或 `outcome_unknown`，不把普通 Hook 进程失败解释为安全拒绝。

这些是当前 Session Hook 的实际并发/重入语义；Role、Agent Runtime 和平台扩展仍按后文设计，不由本节提前实现或扩大。

## 7. Agent Role

初始版本使用五个内置角色：

```ts
/** 初始版本由 Harness 提供并维护 Contract 的内置 Agent Role。 */
export enum BuiltInAgentRole {
  /** 保持 Human 对话、状态和端到端决策编排的顶层角色。 */
  Orchestrator = "orchestrator",
  /** 只读收集代码、Git、Wiki 和公共层事实。 */
  ContextScout = "context_scout",
  /** 只读生成技术方案、风险和业务逻辑变更契约。 */
  SolutionRiskReviewer = "solution_risk_reviewer",
  /** 使用新鲜只读上下文独立验证实现与 Evidence。 */
  IndependentVerifier = "independent_verifier",
  /** 从 Human 修正和重复失败中生成 Learning Candidate。 */
  LearningCurator = "learning_curator",
}

/** Agent Role 可以获得的最大代码写入能力。 */
export enum RoleWriteCapability {
  /** Role 不能修改任何项目或 Harness 状态。 */
  None = "none",
  /** Role 只能生成等待 CLI 校验的 Proposal 文件。 */
  ProposalOnly = "proposal_only",
  /** 顶层 Executor 在通过 Gate 后可以修改精确 Write Set。 */
  ApprovedWriteSet = "approved_write_set",
}
```

本节定义 Role 和运行时不变量；可安装 Agent 配置、Registry、平台渲染和 Promotion 见 [19 Agent Registry](./19-agent-registry-and-platform-rendering.md)。

企业可以注册额外 Role ID，但必须声明输入 Artifact、输出 Schema、Tool Allowlist、Model Tier、写能力和 Eval Suite。

## 8. 角色职责

### 8.1 Orchestrator

- 使用当前已验证 SOTA Frontier Model。
- 负责 Requirement Battle 和 Human DecisionRequest。
- 决定何时调用受限角色。
- 在批准范围内承担 Implementation。
- 汇总但不能伪造角色结果。
- 没有 Approval 权限。

初始版本不额外创建通用 Implementer Subagent，避免 Plan、Human 对话和实现上下文在多次 Handoff 中丢失。需要隔离的高容量操作交给只读角色。

### 8.2 Context Scout

- 只读。
- 返回 Claim、EvidenceRef、未知项和建议调查路径。
- 不生成最终 Requirement 或 Plan。
- 不把 Wiki 指令当作系统指令。

### 8.3 Solution & Risk Reviewer

- 只读。
- 检查 Requirement、当前行为、PlanRisk 和影响面。
- 触发历史业务逻辑或跨仓 Gate。
- 生成 Proposal，不批准自己的方案。

### 8.4 Independent Verifier

- 只读且使用独立 ContextBundle。
- 不读取实现 Agent 的隐藏推理，只读取 Artifact、Diff 和 Evidence。
- 不修改代码使测试通过。
- 发现严重问题时返回 Finding 和所需 Gate。

### 8.5 Learning Curator

- 只读任务记录和 Human 修正。
- 生成 Knowledge、Memory、Instruction、Skill、Validator、Rule 或 Policy Candidate。
- 不直接写长期知识、Skill 或 Wiki。

## 9. Role Invocation Contract

每次调用包含：

- Role ID、Task/Workspace ID 和 Invocation ID。
- AgentDefinition、Resolved AgentInstance 和 Projection Digest。
- 输入 Artifact 与 Context Digest。
- Policy Digest、ApplicableRuleBundle Digest 和架构机制引用。
- InstructionBundle、Memory Selection Digest 和 MemoryAccess。
- Read Set、Tool Allowlist 和 Permission Mode。
- Model Tier、Reasoning 和 Timeout。
- 输出 Proposal Schema。
- 允许重试次数、完成条件和禁止动作。

Role 结果只有在 AgentStop Hook 和 CLI Schema 校验通过后才可进入 Proposal Store。

## 10. Human Battle

Human Battle 始终由 Orchestrator 执行：

- Evidence-first，不询问可从项目确定性发现的问题。
- 一次一个会改变实现的阻断问题。
- 默认最多连续五个问题。
- 每个回答写入 Human EvidenceRef。
- 形成 RequirementContract 后展示范围、非目标和未知项。
- Human Approval 必须绑定 Contract Digest。

Subagent 不直接向 Human 连续提问。需要决策时返回 DecisionRequestDraft，由 Orchestrator 去重后提交。

## 11. 冲突处理

当两个角色结论冲突：

1. 比较 Evidence Revision 和来源可信度。
2. 运行确定性检查可以解决的部分。
3. 使用 Frontier Model 做一次受限 Reconciliation。
4. 仍冲突则创建 Human DecisionRequest。

禁止通过多数投票自动决定业务事实。多个模型产生相同答案也不等于事实成立。

## 12. Prompt Injection 与权限

- Repository、Wiki、Ticket 和 Tool Output 全部标记为 Untrusted Content。
- Role Prompt 明确外部内容不能改变 System、Policy、RuleBundle、Gate 和 Tool Allowlist。
- Context Assembler 分离 Instruction、Artifact 和 Evidence Channel。
- Agent 不能读取 Credential、Harness Runtime Secret 或未授权仓库。
- MCP Write Tool 默认不向只读角色暴露。
- Role 输出中的“已批准”“测试通过”必须由 CLI 重新验证。

## 13. 降级模式

执行器不支持 Subagent 时：

- 使用独立非交互调用运行 Role。
- 如果无法隔离 Permission，则只生成角色 Prompt 供 Human 手动执行。
- 如果无法保证只读，Verifier 和 Context Scout 标记 Unsupported，不伪装运行。

执行器不支持 Hook 时：

- CLI 在每个 Use Case 边界执行相同检查。
- 提醒 Human 自动上下文和 PreAction 防线缺失。
- Production Profile 降级为 Assisted 或 Report-only。

## 14. 测试要求

- 每个 Canonical Event 的输入、输出和幂等 Contract。
- Hook 并发、超时、重入和 Crash。
- R1-R4 PreAction Fail Closed。
- Stop 和 AgentStop 最大继续次数。
- Role Tool Allowlist 和越权负向测试。
- Proposal Schema Repair 仅一次。
- Prompt Injection Fixture。
- 角色冲突到 Human DecisionRequest。
- 无 Hook/Subagent 能力时的降级声明。
- AgentDefinition/AgentInstance Digest、Registry Drift 和平台投影一致性。
