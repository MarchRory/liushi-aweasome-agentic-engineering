# 08 执行器适配

## 1. 目标

Executor Adapter 让同一个 Task State、Artifact、Policy 和 Gate 可以在 Codex 与 Claude-compatible 工具中运行，同时保留各平台的原生能力。适配器必须解决能力差异，不能只转换 Prompt 文件名。

首月目标：

- Codex 是生产主路径。
- Claude-compatible 是可移植路径。
- CatPaw 必须通过真实 Capability Probe、Smoke Test 和 Negative Test 后才能声明支持。
- Core 不嵌入模型 SDK，不管理用户 API Key。
- 平台不可用或能力下降时显式停止或降级，不静默改变保证。

## 2. Adapter 边界

Adapter 负责：

- 探测 CLI、版本、登录状态和能力。
- 渲染 Skills、Hooks、Roles、MCP、AGENTS 指令和项目配置。
- 将 RoleInvocation 转换为执行器原生调用。
- 请求结构化输出并转换为 ProposalEnvelope。
- 记录 Session、Model、Reasoning、Permission 和失败信息。
- 管理 Harness 所有文件的 Install Plan。

Adapter 不负责：

- Task State Transition。
- Gate 和 Approval 判断。
- Artifact Commit。
- Knowledge 或 Skill Promotion。
- 修改 Project Policy 来适配平台限制。

## 3. 能力模型

```ts
/** Adapter 对一个执行器能力的支持程度。 */
export enum CapabilitySupport {
  /** 能力已通过正向和负向测试，可以进入生产路径。 */
  Verified = "verified",
  /** 能力存在但仅通过 Smoke Test，不能宣称完整保证。 */
  Experimental = "experimental",
  /** 能力缺失，但 Harness 有明确且可审计的替代流程。 */
  Degraded = "degraded",
  /** 执行器不支持该能力且没有安全替代。 */
  Unsupported = "unsupported",
}

/** 一次执行器调用采用的交互方式。 */
export enum ExecutorInvocationMode {
  /** Human 与执行器保持交互，Adapter 通过文件和 CLI 协调。 */
  Interactive = "interactive",
  /** Harness 启动一次有边界的非交互 Role 调用。 */
  NonInteractive = "non_interactive",
  /** 执行器在独立 Child Session 或 Subagent 中运行角色。 */
  Delegated = "delegated",
}
```

Capability Matrix 至少包含：

- Skill Discovery 与显式调用。
- Lifecycle Hooks 及每个事件。
- Custom Agent/Subagent。
- Per-role Model Selection。
- Structured Output / JSON Schema。
- MCP、Connector 和认证。
- Filesystem、Network 和 Command Permission。
- Session Resume、Fork 和 Compaction。
- Plugin/Package 分发。
- Windows 路径和 Shell。

每项保存 `support`、检测证据、执行器版本、最后验证时间和已知限制。

## 4. Profile

安装时选择 Profile：

```text
codex
claude-compatible
generic-cli
```

- `codex`：安装 Codex Plugin、Skills、Hooks、`AGENTS.md`、Agent TOML 和项目配置。
- `claude-compatible`：安装兼容的 Skills、Hooks、`CLAUDE.md`/Path Rule、Agent 和 Settings。
- `generic-cli`：只安装 Harness CLI、InstructionBundle 和手动 RoleInvocation，不承诺 Hooks 或 Subagent。

CatPaw 不是静态别名。Probe 识别其具体兼容能力后，基于 `claude-compatible` 生成 Capability Override。

## 5. 安装协议

```powershell
liushi-harness init --target codex --dry-run
liushi-harness init --target claude-compatible --dry-run
liushi-harness init --apply <install-plan-id>
```

InstallPlan 包含：

- 文件 Create、Update、Conflict 和 Skip 列表。
- 每个文件的 Owner、模板、旧 Digest 和新 Digest。
- 执行器信任、重启或新 Session 要求。
- MCP/Connector 的授权步骤，但不包含 Credential。
- Uninstall 和 Rollback 计划。

已有配置不属于 Harness 时只能生成 Patch Proposal。Human 修改过的 Managed File 也不能静默覆盖。

## 6. Codex Adapter

Codex 路径优先使用原生能力：

- Repo Skill 放在 `.agents/skills/`，安装包通过 Plugin 分发通用 Skills。
- Lifecycle Hook 由 Plugin 或项目 `.codex/hooks.json` 提供。
- 项目设置放在受信任的 `.codex/config.toml`。
- Canonical Instruction 投影为根/路径级 `AGENTS.md`。
- Active AgentDefinition 投影为 `.codex/agents/*.toml` 和 `[agents]` 配置。
- 外部系统通过 MCP/Connector 暴露。
- Subagent、Model、Permission、Instruction Discovery 和 Memory 控制能力通过运行时 Probe 记录。

Hooks 只运行 `command` Handler，并统一调用 `liushi-harness hook handle`。任何 Hook 未覆盖的安全边界由 CLI、Sandbox 和 CI 再次执行。

参考：[Codex Skills](https://learn.chatgpt.com/docs/customization/overview#skills)、[Codex Hooks](https://learn.chatgpt.com/docs/hooks)、[Codex Plugin Structure](https://learn.chatgpt.com/docs/build-plugins#plugin-structure)。

## 7. Claude-compatible Adapter

适配器生成：

```text
.claude/
├── settings.json
├── rules/
├── agents/
└── skills/
```

以及平台允许的 Hook、MCP 和 Plugin 资产。为了保持可移植性：

- 核心 Gate 只依赖 Command Hook 共同子集。
- 平台专属 Prompt/Agent Hook 只能作为增强。
- Custom Agent Tool Allowlist 和 Permission 必须显式生成。
- Canonical Instruction 分别投影为 `CLAUDE.md` 和 Path Rule，不从 Claude Auto Memory 反向生成。
- AgentDefinition 投影必须保留 ModelPolicy、Permission、Skill、Context 和 Memory 边界。
- Background Agent 需要 Human Permission 时必须失败返回，不能升级权限。
- 不假设 CatPaw 支持 Claude Code 的全部事件、环境变量和 Agent Frontmatter。

## 8. Role Invocation

```text
Application Use Case
  -> resolve Adapter
  -> validate Capability
  -> resolve Model Policy
  -> render ContextBundle
  -> launch isolated Role
  -> parse structured output
  -> validate ProposalEnvelope
  -> return Proposal to CLI Commit Protocol
```

Role 调用必须有：

- Task、Role、Context 和 Policy Digest。
- ApplicableRuleBundle Digest、适用规则摘要和架构机制引用。
- Read Set、Write Permission 和 Tool Allowlist。
- Model Tier、Reasoning 和 Timeout。
- Output Schema、最大重试次数和停止条件。
- Session ID 和 Transcript Reference，如果平台提供稳定引用。

模型输出解析失败最多执行一次 Schema Repair；第二次失败返回 Adapter Error，不将部分 JSON 写入 Artifact。

## 9. Session 与 Context

- Harness Task ID 是主标识，Executor Session ID 只是外部引用。
- Resume 前重新加载 Task Snapshot，不能只恢复聊天。
- Context Compaction 前由 Hook 保存 Checkpoint；没有 Hook 时由每次 CLI Action 保存。
- Subagent 只收到最小 ContextBundle，不继承未声明的 Human 对话。
- Adapter 只投影已由 Core 解析的 RuleBundle，不自行推断、改写或合并 Rule。
- Transcript 格式不稳定时只保存路径和 Digest，不将其作为 Core Contract。

## 10. Permission

Adapter 将 Role Permission 映射到平台能力：

- Context Scout、Risk Reviewer、Verifier 和 Learning Curator 默认只读。
- 主执行器只有在 Implementation Phase 和 Gate 通过后获得 Write Set。
- MCP Write、外部发布、跨仓和破坏性命令仍需 Harness Human Gate。
- 平台 Permission 比 Harness 更严格时尊重平台并返回 Degraded Result。
- 平台 Permission 更宽松时 Harness Policy 仍然生效。

## 11. 错误分类

```ts
/** Executor Adapter 公开给 Application 的稳定错误类别。 */
export enum ExecutorErrorKind {
  /** 未安装、版本不满足或可执行文件不可发现。 */
  Unavailable = "unavailable",
  /** 登录、Credential 或 Workspace Policy 阻止调用。 */
  Unauthorized = "unauthorized",
  /** 当前执行器不支持 Role 所需能力。 */
  CapabilityMissing = "capability_missing",
  /** 调用超过 Role Policy 定义的时间。 */
  Timeout = "timeout",
  /** 输出无法通过 Proposal Schema。 */
  InvalidOutput = "invalid_output",
  /** 执行器在完成前意外退出。 */
  Interrupted = "interrupted",
  /** 平台返回无法归入其他类别的内部错误。 */
  Internal = "internal",
}
```

原始 Stderr、Exit Code 和平台错误作为 Evidence 保存并脱敏；Core 只依赖稳定 Error Kind。

## 12. Capability Probe

Probe 分三层：

1. **Static Detect**：版本、配置文件和帮助输出。
2. **Smoke Test**：在临时 Fixture 中执行合法最小调用。
3. **Negative Test**：验证拒绝越权写入、无效 Schema、缺失 Approval 和不支持事件。

只有三层全部通过才能标记 `Verified`。工具名称或配置格式相似不能作为兼容证据。

## 13. Contract Test

所有 Adapter 运行同一套 Contract：

- 能力结果可序列化且带证据。
- Install `--dry-run` 不写文件。
- Managed File 冲突不覆盖。
- Read-only Role 无法写入 Fixture。
- Canonical Instruction 与 AGENTS/CLAUDE Projection Digest 一致。
- Agent Registry 与平台 Agent 配置的权限、Skill 和 Output Schema 一致。
- 平台 Memory Claim 不能作为正式 Evidence。
- Proposal Output 严格校验。
- Timeout、Interrupt 和 Retry 行为一致。
- Frontier Model 不可用时不静默降级顶层 Agent。
- Uninstall 不删除 Human 修改文件。

Codex 额外执行完整 E2E；Claude-compatible/CatPaw 先执行 Fixture Smoke 和 Negative Test。

Instruction、Memory 和 Agent 的完整平台契约分别见 [17 Instruction Projection](./17-instruction-projection.md)、[18 Memory Runtime](./18-memory-runtime-and-curation.md) 和 [19 Agent Registry](./19-agent-registry-and-platform-rendering.md)。

## 14. 支持声明

README 和发布信息只能使用以下措辞：

- `production`：Contract、E2E、负向权限和真实任务均通过。
- `compatible`：共同 Contract 和 Smoke Test 通过，列出差异。
- `experimental`：仅部分能力验证，不承诺生产保证。
- `unsupported`：明确阻止安装对应 Profile。

首月预期：Codex `production`，Claude Code `compatible`，CatPaw 在获得真实环境验证前保持 `experimental`。
