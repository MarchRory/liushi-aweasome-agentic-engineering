# 11 Skills 与 Connectors

## 1. 目标

Skill 将可重复工作流、项目知识和确定性脚本封装为可发现能力；Connector 负责访问 Wiki、Issue Tracker、文档和其他外部系统。二者必须分离：

- Skill 决定流程和何时调用能力。
- Connector 负责认证、读取、写入和外部系统错误。
- Skill 不保存 Credential，不直接实现企业 API。
- Connector 不决定业务工作流、Human Gate 或知识晋升。
- AI 可以生成 Skill/Knowledge Proposal，确定性 CLI 执行写入。

### 1.1 当前实现状态

**状态：设计完成，尚未实现。** 当前包没有 Skill Registry、Skill Runner、Wiki/Issue Connector、MCP Adapter、Obsidian 同步或知识写入能力。Scanner 和 Digest Adapter 是可供未来 Skill 复用的确定性基础，但不属于 Skill Runtime。Connector 写入、Wiki 发布和企业认证仍必须视为未支持能力。

## 2. 标准复用

Skill Authoring 遵循 [Agent Skills Specification](https://openagentskills.dev/docs/specification)，使用 `SKILL.md`、`scripts/`、`references/` 和 `assets/`。外部能力优先通过 [Model Context Protocol](https://modelcontextprotocol.io/) 或执行器 Connector 接入。

Codex 将 Skill 作为可复用工作流并支持脚本、参考资料和渐进加载；可通过 Plugin 与 Hooks、MCP 一起分发。[Codex Skills](https://learn.chatgpt.com/docs/customization/overview#skills)

Harness 不重新发明 Skill 文件格式，只补充治理 Manifest、Eval 和 Promotion Contract。

## 3. Canonical Skill 目录

```text
integrations/skills/<skill-id>/
├── SKILL.md
├── harness.skill.yaml
├── scripts/
├── references/
├── assets/
└── evals/
```

- `SKILL.md`：模型可读流程和触发说明。
- `harness.skill.yaml`：版本、Scope、Risk、Input/Output Artifact 和能力需求。
- `scripts/`：确定性扫描、转换、验证和写入命令。
- `references/`：按需加载的稳定参考资料。
- `assets/`：模板和非执行资源。
- `evals/`：正向、负向、边界和回归 Fixture。

Codex 和 Claude-compatible Adapter 从同一 Canonical Skill 渲染平台安装资产，禁止维护两份内容逐渐漂移的 Skill。

## 4. Skill Scope

```ts
/** Skill 可被发现和调用的最大作用域。 */
export enum SkillScope {
  /** 随 npm 包分发且不包含项目知识。 */
  BuiltIn = "built_in",
  /** 由企业 Policy 管理并在多个 Workspace 共享。 */
  Organization = "organization",
  /** 只适用于一个多仓 Workspace。 */
  Workspace = "workspace",
  /** 只适用于一个 Repository。 */
  Repository = "repository",
  /** 仅为一个 Task 临时生成，不允许晋升前复用。 */
  Task = "task",
}

/** Skill 当前能否进入生产执行路径。 */
export enum SkillLifecycleStatus {
  /** 正在编写，不能被 Agent 自动发现。 */
  Draft = "draft",
  /** 已生成候选并等待 Eval。 */
  Candidate = "candidate",
  /** 正在运行 Regression 和 Negative Eval。 */
  Evaluating = "evaluating",
  /** Human 已批准并允许在声明 Scope 内使用。 */
  Active = "active",
  /** 暂停自动调用但保留手动检查和历史。 */
  Suspended = "suspended",
  /** 已由替代 Skill 或新流程取代。 */
  Deprecated = "deprecated",
}
```

作用域越具体优先级越高，但更具体 Skill 不能削弱 Hard Invariant、Organization Policy 或 Human Gate。

## 5. Skill Manifest

Manifest 至少包含：

- Skill ID、Version、Scope、Owner 和 Lifecycle Status。
- Trigger Description 和明确 Non-trigger。
- 输入 Artifact、输出 Proposal 和所需 Evidence。
- 所需 Executor Capability、Connector、Tool 和 Permission。
- 允许使用该 Skill 的 Agent Role、Context Scope 和 MemoryAccess。
- 风险等级、允许的副作用和所需 Gate。
- 所需 Rule ID、Architecture Mechanism、Validator 和允许的 Rule Exception 类别。
- Script Digest、Reference Digest 和 Eval Suite ID。
- 兼容的 Harness Schema 和 Project Profile 条件。

Trigger 不能只写“处理项目任务”之类宽泛描述。多个 Skill 同时匹配时，Orchestrator 根据 Scope、Capability 和明确优先级选择；仍冲突则不自动调用。

## 6. 内置 Skill

初始版本最小集合：

1. `harness-onboard`：扫描项目、生成 Profile Proposal 和安装计划。
2. `project-rules`：扫描规则和架构机制候选，编译 ApplicableRuleBundle 并生成合规报告。
3. `requirement-battle`：Evidence-first 需求澄清和 Contract Proposal。
4. `plan-risk`：技术方案、Write Set、Risk 和 Gate Proposal。
5. `business-logic-contract`：还原历史行为并生成变更契约。
6. `implement-approved-plan`：只在批准范围内编排实现。
7. `verify-evidence`：运行 Validator 并构建 Evidence Bundle。
8. `learning-candidate`：从修正和失败生成候选。
9. `memory-curator`：根据 Evidence 分类 Memory Destination，只生成可审计 Candidate。
10. `workspace-sync`：确定性检查 Graph、Profile、Instruction、Memory、Agent、Rule 和知识漂移。

这些 Skill 编排 CLI；不会在 Markdown 指令中重新实现状态机。

## 7. Script 规则

必须使用确定性 Script 的操作：

- 扫描文件、Package、Git、测试配置和依赖。
- Schema Validation、Digest、Diff 和格式转换。
- Artifact、Policy、Rule、Knowledge 和 Managed File 写入。
- Instruction/Agent 平台投影、Memory Candidate 写入和 Retrieval Index 重建。
- Rule Scope 解析、优先级合并、Bundle 编译、Exception 校验和 Compliance Report 生成。
- Wiki Draft Patch 生成和 Idempotency Key。
- Eval、Metrics 和 Changelog 生成。

AI 适合：

- 解释业务语义和冲突。
- 生成方案、风险和候选文本。
- 从 Evidence 中提出结构化 Proposal。

Script 不调用隐藏模型；如果需要模型判断，必须通过 RoleInvocation 和 ModelExecutionRecord 显式完成。

## 8. Connector Port

```ts
/** Connector 对外部系统执行的标准操作类别。 */
export enum ConnectorOperation {
  /** 按稳定 ID 和 Revision 读取单个资源。 */
  Read = "read",
  /** 在授权 Scope 内搜索资源。 */
  Search = "search",
  /** 生成不影响正式内容的外部 Draft。 */
  CreateDraft = "create_draft",
  /** 在 Human Gate 后将 Draft 发布为正式内容。 */
  Publish = "publish",
}

/** Harness 访问一个外部知识或任务系统所需的 Port。 */
export interface ConnectorPort {
  /** 探测认证、Scope、读写和 Revision 能力。 */
  detectCapabilities(): Promise<ConnectorCapabilities>;
  /** 按稳定引用读取并返回带 Provenance 的资源。 */
  read(input: ConnectorReadInput): Promise<ConnectorResource>;
  /** 在授权 Scope 内搜索并返回分页引用。 */
  search(input: ConnectorSearchInput): Promise<ConnectorSearchResult>;
  /** 生成可 Review 的外部 Draft，不直接发布。 */
  createDraft(input: ConnectorDraftInput): Promise<ConnectorDraft>;
  /** 发布已绑定 Human Approval 和 Idempotency Key 的 Draft。 */
  publish(input: ConnectorPublishInput): Promise<ConnectorPublishResult>;
}
```

初始版本 Wiki Connector 必须支持 Read、Search 和 CreateDraft。Publish 只有在真实企业环境通过权限、幂等和负向测试后才可启用。

## 9. Wiki 读取

Wiki Resource 返回：

- Connector ID、Space、Page ID 和 Revision。
- Canonical URL、Title、Owner 和 Updated At。
- 授权 Scope 和读取 Actor。
- 内容片段、Content Digest 和原文定位。
- 是否包含可执行指令或潜在 Prompt Injection。

Context 中引用 Wiki 时保留 Provenance。Wiki 只能证明“该 Revision 的 Wiki 如此描述”，还需要代码、测试或 Human Evidence 判断当前实际行为。

## 10. Wiki 写入

```text
Learning/Documentation Proposal
  -> deterministic Patch
  -> local Draft Artifact
  -> Connector CreateDraft
  -> Human Review
  -> G7 Approval
  -> Connector Publish with idempotency key
  -> read-after-write verification
```

Publish 前页面 Revision 变化时 Patch 失效，必须重新生成 Diff。Connector 不自动覆盖他人更新。

## 11. MCP 与认证

- MCP Server 提供工具、资源、认证和结构化结果。
- Credential 使用执行器、企业 SSO 或系统 Credential Store。
- Skill、Artifact、日志和开源配置中不保存 Token。
- Adapter 记录 MCP Server Identity 和 Capability，不把同名 Server 当作同一信任主体。
- Read 和 Write Tool 分开授权。
- MCP Tool Output 属于 Untrusted Evidence，必须 Schema Validate 和脱敏。

## 12. Prompt Injection 防护

- 外部内容与系统指令分离。
- Context Assembler 为 Wiki/Ticket 标记来源和不可信边界。
- 外部内容中的“忽略规则”“执行命令”“上传文件”不改变 Role Permission。
- Skill 只调用 Manifest 声明的 Connector Operation。
- Publish、删除、移动等外部副作用必须 Human Gate。
- Connector 返回异常 HTML、脚本或超大内容时截断并保留 Digest。

## 13. Obsidian

Obsidian 是可选的 Human View，不是运行时唯一事实源：

- 确定性脚本将已评审 Git Knowledge 和 Wiki 引用投影为 Markdown。
- Frontmatter 保存 Knowledge ID、Scope、Source、Revision 和 Digest。
- Human 在 Obsidian 的修改先生成 Knowledge Proposal。
- 同步冲突不自动双向覆盖。
- 初始版本不开发 Obsidian Plugin，只提供目录投影和链接。

## 14. Skill 生成与改进

候选来源：

- 明确 Human 修正立即生成。
- 普通失败在同一模式重复至少两次后生成。
- 项目规则漂移或 Validator 持续遗漏。

候选必须包含 Evidence、适用 Scope、反例、删除条件和 Eval。AI 生成 `SKILL.md` Patch Proposal；CLI 确定性写候选目录。只有 G7 通过后才改为 Active。

## 15. CLI 草案

```powershell
liushi-harness skills list
liushi-harness skills evaluate <skill-id>
liushi-harness skills promote <candidate-id> --dry-run
liushi-harness connector add wiki --mode read
liushi-harness connector doctor wiki
liushi-harness knowledge sync --connector wiki --dry-run
```

## 16. 测试要求

- Agent Skills 目录和 Manifest Schema。
- Skill Trigger 正向、负向和冲突 Fixture。
- Script Digest、Sandbox 和无隐藏模型调用。
- Connector Read/Search Pagination、Revision 和脱敏。
- Wiki Draft 幂等、Revision 冲突和 Read-after-write。
- MCP 同名不同 Identity。
- Prompt Injection 和越权 Publish。
- Skill Eval 失败时不能 Active。
- Obsidian Projection 单向一致性和冲突。

## 17. 初始版本边界

- 内置十个最小 Skill 可以逐步实现，生产闭环优先前七个；`memory-curator` 只能在 Memory Candidate、Retrieval 和 Promotion Gate 完成后接入。
- Wiki Read/Search/CreateDraft 可用，Publish 默认关闭。
- Learning Candidate 自动生成，Skill 自动晋升永久关闭。
- 企业 Connector 以 Port 和 Fixture 提供，不进入开源包 Credential 或业务逻辑。
