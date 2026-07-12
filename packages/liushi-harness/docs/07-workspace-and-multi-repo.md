# 07 Workspace 与多仓组织

## 1. 目标

企业需求通常同时依赖 Application、公共组件、共享 Infra、Schema、文档和内部 Wiki。Workspace 层必须在不放大写入风险的前提下提供完整上下文：

- 用显式 Graph 表达仓库、公共层、知识源和所有权。
- 支持多仓读取和影响分析，默认仅允许一个仓库写入。
- 将 Read Set、Write Set 和 Base Revision 固化进 Artifact。
- 为每个写仓库使用独立 Worktree 和 Repository Lock。
- 发现依赖或 Revision 漂移时使旧 Approval 失效。
- 不把本机绝对路径和企业信息写入开源包。

### 1.1 当前实现切片

当前运行时尚未实现 Worktree、跨仓写入 Saga 和 Repository Lock。本轮已经实现 Rule Resolution 所需的最小多仓身份边界、只读 Project Scanner 和 Human-gated Profile Bundle 编译：

- `WorkspaceRuleContextRef` 绑定 Workspace ID、Workspace Graph Revision 和可选 Organization ID。
- `RepositoryRuleContextRef` 绑定 Repository ID、Base Revision、ProjectProfile Revision 和可选 ArchitectureMechanismProfile Revision。
- `RuleResolutionContext` 显式列出 Task 目标文件、Repository、语言、文件类型和操作，不从 Import 自动扩大目标集合。
- `ApplicableRuleBundle` Digest 绑定上述 Context；Catalog 与当前 Context 不一致时返回 `blocked` 和结构化 Drift。
- `project scan` manifest 显式列出多个 Repository 的本机 root，但 root 是 runtime-only 输入，不进入 `ProjectDiscoveryReport`、Candidate 或 digest。
- Project Scanner 只读文件树、package manifest、lockfile、JSONC/YAML 配置和目录结构，输出 ProjectProfile、Rule、Architecture Mechanism 与依赖边 Candidate。
- Project Scanner 不使用人工容量或读取预算；全量遍历普通目录和文件，并读取全部被分类的配置文件。规模本身不影响完整性，路径不可读、链接跳过、大小写冲突或配置解析失败才会使报告 `incomplete`。
- 多个 Repository 同时声明同一 package owner 时，依赖关系进入稳定排序的 `dependencyAmbiguities`，报告为 `incomplete`，不能静默丢弃或任选一条边。
- 任何 Candidate 都不能直接变成 Active Rule；`profilePromotionStatus` 固定为 `HumanReviewRequired`。
- Human 必须在 `ProjectProfileProposal` 中确认每个 Repository Role 并完整划分 Rule/Mechanism Candidate；G8 对精确 Proposal Digest 审批。
- `profile compile` 重新校验 Report 与审批域，生成多仓 ProjectProfile Bundle 和 repository-qualified Active Rule，避免不同仓库的同语义 Rule ID 碰撞。

这些 Ref 只保存稳定 ID 与 Revision，不保存完整 WorkspaceGraph、本机绝对路径或企业原文。后文完整 Workspace 生命周期仍是目标架构。

## 2. 核心概念

```ts
/** Repository 在 Workspace 中承担的主要责任。 */
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
}

/** Task 对一个 Repository 的授权访问级别。 */
export enum RepositoryAccessMode {
  /** Repository 不属于本次 Task 上下文。 */
  None = "none",
  /** 允许读取、搜索和执行无副作用检查。 */
  Read = "read",
  /** 允许在受控 Worktree 和 Write Set 内修改。 */
  Write = "write",
}

/** Workspace Graph 中 Repository 之间的依赖关系。 */
export enum RepositoryEdgeKind {
  /** Source Repository 在构建或运行时依赖 Target。 */
  RuntimeDependency = "runtime_dependency",
  /** Source Repository 仅在开发或测试时依赖 Target。 */
  DevelopmentDependency = "development_dependency",
  /** Source Repository 使用 Target 定义的 Schema 或协议。 */
  ContractDependency = "contract_dependency",
  /** Source Repository 的发布需要与 Target 协调。 */
  ReleaseDependency = "release_dependency",
  /** Source Repository 由 Target 中的文档或知识解释。 */
  KnowledgeDependency = "knowledge_dependency",
}
```

开放的企业仓库类型通过扩展 Registry 注册，不允许用任意字符串覆盖核心 Enum 语义。

## 3. WorkspaceGraph

WorkspaceGraph 是已评审 Artifact，不是每次运行临时扫描结果。它包含：

- Workspace ID、Graph Revision 和最后确认人。
- Repository ID、规范绝对路径、Remote Identity 和当前 Revision。
- Repository Role、Owner、Read Policy 和 Write Policy。
- 有方向的依赖边、证据和可信等级。
- Wiki、Issue Tracker、设计文档等 Knowledge Source 引用。
- 共享验证命令和跨仓兼容性检查。

不在 Graph 中保存 Credential、Wiki 原文和可发布的企业路径。运行时文件可以包含本机路径；提交到仓库的模板只使用 Repository ID 和相对位置。

## 4. 配置分层

```text
~/.liushi-harness/workspaces/<workspace-id>/workspace.yaml
<repo>/.liushi-harness/project.yaml
<repo>/.liushi-harness/policy.yaml
<repo>/.liushi-harness/rules/
<repo>/.liushi-harness/mechanisms/
<repo>/.liushi-harness/instructions/
<repo>/.liushi-harness/agents/
<repo>/.liushi-harness/memory-policy.yaml
```

`workspace.yaml` 保存本机 Repository 映射和 Task 运行约束；`project.yaml` 保存可提交的仓库身份、Role、验证命令和依赖声明；`rules/`、`mechanisms/`、`instructions/`、`agents/` 和 `memory-policy.yaml` 保存 Human 确认的项目运行契约。企业模板可以引用组织级包，但不能把企业源码或 Wiki 原文复制进开源包。

示例：

```yaml
schemaVersion: "1.0.0"
workspaceId: analytics-agent
repositories:
  - id: analytics-web
    path: D:/work/analytics-web
    role: application
  - id: ui-infra
    path: D:/work/ui-infra
    role: shared_infrastructure
edges:
  - from: analytics-web
    to: ui-infra
    kind: runtime_dependency
```

路径加载后必须执行规范化、真实路径解析和 Workspace Root 校验。Symlink、Junction 或大小写差异不能用于逃逸允许范围。

## 5. Bootstrap 与发现

发现顺序固定：

1. 读取 Human 显式登记的 Repository 和 Knowledge Source。
2. 确定性扫描 Package Manifest、Workspace、Git Remote、CODEOWNERS 和构建脚本。
3. 扫描 Lint、测试、目录依赖、公共 API、状态管理和历史高频模式，生成 Rule 与 Architecture Mechanism Candidate。
4. 根据 Import、Package Dependency 和 CI 生成候选依赖边。
5. AI 对候选边和候选规则解释业务意义，明确 Fact、Inference 和 Unknown。
6. Human 确认 Repository Role、所有权、高风险边、Active Rule 和架构机制。
7. CLI 提交 WorkspaceGraph、ProjectRuleCatalog 和 ArchitectureMechanismProfile Revision。

AI 不得通过发现 Import 自动扩大 Task Write Set。

当前 `project scan` 覆盖上述第 2、3、4 步中的确定性只读事实收集；`ProjectProfileProposal`、G8 和 `profile compile` 覆盖第 6 步及第 7 步的可审计 Bundle 编译。它们不会运行 Git、执行构建脚本或修改仓库。配置无法解析、存在重复 package owner、大小写冲突、路径不可读或 symlink/junction 跳过时，报告为 `incomplete`，不能进入编译。扫描 `complete` 也必须经过 Human G8；旧 Proposal Revision 的 Approval 不得复用。

## 6. Read Set 与 Write Set

每个 Task 持有：

- **Read Set**：允许用于 Context 和 Evidence 的 Repository、路径、Revision 与 Connector Scope。
- **Write Set**：允许修改的 Repository、路径、文件类型和操作类别。
- **Protected Set**：即使位于 Write Set 中也需要额外 Gate 的路径。

规则：

- Context Phase 可以建议扩大 Read Set，涉及敏感仓库时需要 Human。
- Requirement Approval 绑定初始 Scope。
- Planning 固化精确 Write Set。
- Implementation 中扩大 Write Set 必须停止并重新执行 Risk Gate。
- 删除、移动、生成文件覆盖和配置写入分别计入操作类别，不能用“目录已允许”概括。

## 7. 公共层处理

Shared Infrastructure 默认只读。Task 需要修改公共层时必须：

1. 还原当前公共行为、版本和调用方。
2. 生成 BusinessLogicChangeContract 或 PublicContractChange。
3. 列出所有已知下游 Repository 和兼容性风险。
4. 通过 G2 Business Logic 和 G3 Cross Repo Gate。
5. 使用独立 Worktree、Branch 和 EvidenceBundle。
6. 由公共层 Owner Review。

“只修改一行公共代码”不降低风险等级。

## 8. 多仓写入 Saga

首月默认一个 Task 只有一个 Write Repository。明确批准的跨仓写入不宣称原子性，而是使用 Saga：

```text
Prepare all repositories
  -> Apply repository A
  -> Verify repository A
  -> Apply repository B
  -> Verify integration
  -> Prepare independent reviews
```

每一步有 Action Intent、Base Revision、幂等键和补偿说明。任一步失败：

- 停止后续 Repository 写入。
- 保留已经产生的 Branch、Diff 和 Evidence。
- 不自动 Reset 或删除 Worktree。
- 生成 PartialCompletion DecisionRequest。
- 由 Human 决定补偿、继续或拆分 Task。

## 9. Worktree 与 Branch

建议命名：

```text
~/.liushi-harness/worktrees/<workspace-id>/<task-id>/<repository-id>/
lh/<task-id>/<short-description>
```

要求：

- Worktree 创建前持有 Repository Write Lock。
- Base Commit 固化到 Task Artifact。
- 不复用包含未知变更的 Worktree。
- Human 在 Worktree 中的修改标记为 External Change，不得覆盖。
- Review-ready 后默认保留，直到 Human 记录 Merge、Abandon 或 Cleanup。
- 清理前验证绝对路径、Git Worktree Registry 和 Managed Ownership。

## 10. Revision 漂移

下列漂移使相关 Approval 失效：

- Write Repository Base Branch 前进并触及计划范围。
- Read Repository 中作为 Evidence 的 Revision 变化。
- 公共 Package Version、Lockfile 或 Schema 变化。
- Wiki 页面 Revision 变化且影响 Business Contract。
- WorkspaceGraph 或 ProjectProfile 更新。
- ProjectRuleCatalog、ArchitectureMechanismProfile 或组织规则包 Revision 更新。
- Instruction Catalog、Agent Registry、Memory Policy 或 Managed Projection Revision 更新。

只读仓库发生无关变化时可以由确定性 Diff Scope Check 证明 Approval 仍有效；无法证明无关时必须重新 Planning。

## 11. Context 组装

ContextBundle 只包含完成当前角色所需的最小信息：

- Repository 摘要和相关依赖边。
- 精确文件、Symbol、Git 和 Wiki Evidence。
- 已批准 Artifact Digest 和 Policy 摘要。
- ApplicableRuleBundle Digest、目标架构机制和 Validator 命令。
- InstructionBundle、AgentInstance 和 Memory Selection Digest。
- 未知项、禁止范围和停止条件。

Context Scout 可以并行调查不同只读仓库，但最终由一个确定性 Context Assembler 去重、限制大小并记录输入 Digest。不得把多个仓库完整源码直接塞入 Prompt。

## 12. 知识作用域

知识优先级从具体到通用：

```text
Task -> Repository Path -> Repository -> Workspace -> User Global
```

公共层知识属于其 Owner Repository，不复制为多个 Application 的独立事实。Application 可以保存引用和本地使用约束，避免公共知识分叉。

## 13. 并发与锁

- 同一 Repository 同时最多一个 Write Task。
- 不相交 Repository 的只读扫描可以并行。
- 跨仓 Task 按规范路径排序获取 Repository Lock。
- Human 等待和模型调用期间不持有文件锁。
- WorkspaceGraph 更新使用 Workspace Registry Lock，不与普通读取长期互斥。

## 14. CLI 草案

```powershell
liushi-harness workspace create analytics-agent
liushi-harness repo add D:\work\analytics-web --role application --dry-run
liushi-harness repo link analytics-web ui-infra --kind runtime_dependency
liushi-harness workspace scan --read-only
liushi-harness workspace review
liushi-harness workspace approve
liushi-harness task scope show <task-id>
```

所有变更命令提供 `--dry-run` 和稳定 `--json` 输出。

## 15. 测试要求

- Windows Drive、UNC、大小写、Symlink 和 Junction 路径。
- Repository 移动、Remote 改变和重复登记。
- Dependency Cycle 和无效 Edge。
- Read Set/Write Set 扩大与 Approval 失效。
- 同仓竞争、跨仓锁顺序和进程崩溃。
- Partial Saga 恢复和未知外部变更。
- 公共层下游影响分析 Fixture。
- 多仓 Context 去重与 Token Budget。

## 16. 首月边界

- 支持显式登记的多仓读取和公共层影响分析。
- 默认只允许单仓写入。
- 跨仓写入只用于受控试验，必须 Human Gate，不作为首月成功指标。
- 不实现自动创建多仓 Pull Request、自动合并和跨仓发布。
