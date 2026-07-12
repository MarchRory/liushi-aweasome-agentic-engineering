# 14 生产接入与长期使用 SOP

## 1. 目标

本 SOP 适用于 `liushi-harness` 发布后接入一个真实项目。接入不是运行一次安装命令后立即开放自动开发，而是三个持续循环：

1. **Workspace Onboarding**：一次性建立可信项目基线。
2. **Task Delivery**：每个需求经过同一条可审计链路。
3. **Operational Governance**：周期性维护 Policy、Knowledge、Skill、Model 和指标。

任何阶段出现异常都可以退回 Report-only，不要求卸载 Harness。

### 1.1 当前可执行范围

**状态：完整 SOP 设计已完成，但只有确定性 Bootstrap 和 Codex Hook 前置子集可执行。** 当前可以安装 npm 包、检查 Runtime Store、创建与查询 Task、提交 Artifact、记录 Human Approval、解析 Rule、扫描多仓、通过 G8 编译 ProjectProfile Bundle，并执行只读 Codex Capability Probe、生成待审阅 Hook 配置和绑定已批准 PlanRisk。Workflow Runtime、真实项目 Hook Smoke、自动安装/写入、Verification Runner、Skills、Connectors、Memory 和 Learning 尚未实现，因此第 5 节之后的自动交付流程目前是目标 SOP，不是生产能力声明。

## 2. 责任角色

| 角色               | 责任                                                   |
| ------------------ | ------------------------------------------------------ |
| Harness Maintainer | 维护开源包、Schema、Migration、Release 和兼容矩阵      |
| Workspace Owner    | 确认多仓 Graph、Policy、Memory、Connector 和运行指标   |
| Repository Owner   | 确认 Profile、Rule、Instruction、Agent、验证和保护路径 |
| Business Reviewer  | 确认历史业务逻辑和行为变更契约                         |
| Task Developer     | 与 Orchestrator 完成 Requirement Battle、Review 和交付 |
| Release Owner      | 执行 Merge、Release、Rollback 和生产观察               |

小团队可以一人承担多个角色，但 ApprovalRecord 必须记录当时使用的责任身份。

## 3. 接入前提

- Repository 工作树干净或已明确记录现有变更。
- Node、Package Manager、Git 和项目验证命令可用。
- 至少指定一个 Workspace Owner 和 Repository Owner。
- 明确企业代码、Wiki 和 Credential 不得进入开源仓库。
- 选择 Codex、Claude-compatible 或 Generic Profile。
- 准备至少 3 个历史需求用于 Baseline Replay。
- 预先确定 HTT、周期、返工和缺陷的统计口径。

## 4. 一次性 Onboarding

### 4.1 创建 Workspace

```powershell
liushi-harness workspace create <workspace-id>
liushi-harness repo add <application-path> --role application --dry-run
liushi-harness repo add <infra-path> --role shared_infrastructure --dry-run
```

Human 确认 Repository ID、Role、Owner、Read Policy 和默认 Write Policy。

### 4.2 执行器安装

```powershell
liushi-harness init --target codex --dry-run
liushi-harness init --apply <install-plan-id>
liushi-harness doctor
liushi-harness hook probe --executor codex --json
```

必须 Review：

- 创建、更新、冲突和跳过的文件。
- Hook 命令、权限和信任要求。
- AGENTS/CLAUDE Projection、Skill、Agent、Role、MCP 和配置来源。
- Managed Ownership、Rollback 和 Uninstall。

不得覆盖不属于 Harness 的执行器配置。

### 4.3 只读 Bootstrap

```powershell
liushi-harness workspace scan --read-only
liushi-harness project profile --repo <repo-id> --propose
liushi-harness rules scan --repo <repo-id> --propose
liushi-harness instructions scan --repo <repo-id> --propose
liushi-harness agents render --target <adapter-id> --dry-run
```

确定性扫描 Package、框架、目录、CI、测试、Git、CODEOWNERS、已有 Agent 配置和候选依赖边；同时抽取 Lint/架构约束、状态管理、API、错误处理、权限、Feature Flag 和埋点机制。AI 只解释候选，区分 Enforced Rule、Mainstream Pattern、Legacy Pattern 和 Unknown，不直接激活规则。

### 4.4 Human 基线评审

确认：

- WorkspaceGraph 和公共层依赖。
- ProjectProfile 和所有 Required Validator。
- ProjectRuleCatalog、ArchitectureMechanismProfile、Pattern Classification 和 Blocking Rule Validator。
- Instruction Catalog、平台 Projection Diff、内容预算和 Managed Ownership。
- Memory Policy、Retention、Sensitivity、Platform Memory 状态和 Obsidian Projection。
- Agent Registry、ModelPolicy、Permission、Tool/Skill、MemoryAccess 和 Eval Suite。
- Protected Path、历史业务敏感区域和审批人。
- 默认 Read Set、Write Set 和跨仓规则。
- 执行器 Capability Matrix。
- Knowledge Source、Canonical Owner 和 TTL。

通过后由 CLI 提交 Artifact Revision，并生成带 Source Digest 的 Instruction/Agent Projection Plan。已有 Human 文件必须单独确认接管或保持 External。

### 4.5 Connector

```powershell
liushi-harness connector add wiki --mode read
liushi-harness connector doctor wiki
liushi-harness knowledge sync --dry-run
```

首个阶段只开 Read/Search。CreateDraft 和 Publish 分别在真实权限与幂等测试后启用，Publish 永远保留 Human Gate。

### 4.6 指标 Baseline

对历史需求记录：

- Requirement 澄清 Human 时间。
- 方案和编码 Human 时间。
- Review、返工和验证 Human 时间。
- 总 Cycle Time。
- Review 轮数、缺陷和 Waiver。

Setup、Prompt 修正、Agent 等待期间 Human 实际操作和返工都计入 HTT，不能只统计写代码时间。

## 5. 分级放量

| Level          | 行为                                    | 升级条件                               |
| -------------- | --------------------------------------- | -------------------------------------- |
| L0 Report-only | 只扫描、分析和报告                      | 历史 Replay 无严重漏检                 |
| L1 Assisted    | 生成 Requirement、Plan 和 Risk Proposal | Human 认可 Artifact 质量               |
| L2 Controlled  | 自动执行低风险单仓实现和验证            | 至少 2 个真实低风险 Task 无质量回退    |
| L3 Production  | 在 Policy 允许范围内执行完整闭环        | 至少 3 个真实 Task，HTT 中位数下降 25% |

自动 Merge、Release、Skill Promotion 和 Wiki Publish 不属于更高 Level，仍然需要 Human Gate。

## 6. 每个 Task 的标准流程

### 6.1 Intake

```powershell
liushi-harness task create --source <ticket-url>
liushi-harness task prepare <task-id>
```

绑定 Workspace、Base Revision、Ticket、初始 Read Set 和 Baseline Metrics。

同时解析 InstructionBundle、Eligible AgentDefinition 和初始 Memory Selection；三者都绑定 Digest，不能只依赖执行器聊天上下文。

### 6.2 Requirement Battle

- Context Scout 先收集可确定的信息。
- Orchestrator 一次询问一个会改变实现的问题。
- 默认最多连续五个问题。
- 生成 RequirementContract，展示目标、非目标、验收、范围和未知。
- Human Approval 绑定 Contract Digest。

### 6.3 Plan 与 Risk

- 生成 PlanRisk、Write Set、Verification Plan 和 Rollback。
- 根据任务 Scope 和目标路径编译 ApplicableRuleBundle，固定 Digest、适用架构机制和 Validator。
- 解析 AgentInstance、InstructionBundle 和 Role-scoped Memory Selection。
- Solution Risk Reviewer 独立检查。
- 触及历史逻辑时生成 BusinessLogicChangeContract。
- 跨仓、公共层和 R2/R3 动作进入 Human Gate。

### 6.4 Implementation

- 创建受控 Worktree。
- Orchestrator 使用批准模型和权限执行。
- 所有写入、命令和外部动作进入 Action Journal。
- Scope 扩大、业务事实冲突、Rule/Architecture Violation 或 Revision 漂移时立即停止。
- Human 不需要批准每个安全局部编辑。

### 6.5 Verification

- 运行 Required/Conditional Validator。
- 运行 Rule Compliance 和架构机制检查，生成 RuleComplianceReport。
- 记录实际命令、版本、Revision、退出码和输出 Digest。
- Independent Verifier 使用新鲜只读 Context。
- 失败返回 Implementation；无法执行的 Required Check 请求 Waiver。

### 6.6 Review-ready

交付：

- Requirement、Plan、Business Contract 和 Approval Digest。
- 最终 Diff、EvidenceBundle、Finding 和 Remaining Risk。
- RuleBundle Digest、RuleComplianceReport、Rule Exception 和机制变化摘要。
- Waiver、Rollback 和 Release Notes Draft。

Human 执行 Review、Merge 和 Release。Harness 不将“代码生成完成”标记为 Task Done。

### 6.7 Learning

- 结算 HTT、Cycle、Retry、Rework 和 Finding。
- Human 修正立即生成 Candidate。
- 普通失败满足重复阈值后生成 Candidate。
- `memory-curator` 对候选建议 Knowledge、Rule、Skill、Instruction、Working Memory 或 Discard Destination。
- 生成 Knowledge/Rule/Instruction/Agent/Skill/Wiki Candidate 或 Draft，但不阻塞 Task 结束。
- Promotion 在独立治理队列中处理。

## 7. Human 介入点

正常 Task 只保留：

1. RequirementContract Approval。
2. 历史业务逻辑、跨仓和其他高风险方案 Approval。
3. Required Verification Waiver 或范围扩大。
4. Rule Exception、Blocking Rule 变更或架构机制偏离的 G8 Approval。
5. 最终 Review、Merge 和 Release。
6. Knowledge/Rule/Instruction/Agent/Skill/Wiki Promotion，异步处理。

DecisionRequest 必须提供证据、推荐项和每个选项后果；同一 Task 同时最多一个阻断决策。

## 8. 多任务管理

- 初始每个 Workspace 一个 Active Task。
- Recovery/Lock 测试通过后默认最多两个。
- 每个 Task 使用独立 Worktree、Artifact、Event Log 和 ContextBundle。
- 同一 Repository 同时最多一个 Write Task。
- 切换 Task 时通过 CLI Resume，不依赖聊天列表记忆。
- 长期 WAITING_HUMAN Task 每周审查，不能占用 Write Lock。

## 9. 日常与周期治理

### 每个 Task 自动执行

- Snapshot、Event、Evidence 和 Metrics 结算。
- Stale Knowledge 检查。
- RuleBundle Drift、过期 Exception 和 Validator 覆盖检查。
- Instruction/Agent Projection Drift、Memory TTL 和 Retrieval Index 检查。
- Candidate 生成。
- Orphan Worktree 和 Lock 检查。

### 每周 30 分钟

- Review Candidate、重复失败和 Human 修正。
- Review WAITING_HUMAN、Waiver 和 Flaky Test。
- Review Rule Violation、Undetermined、Exception 和新发现的架构机制候选。
- 检查 HTT 是否通过减少质量步骤被“优化”。
- 清理已确认可删除的 Worktree 和 Draft。

### 每月 60 分钟

```powershell
liushi-harness audit
liushi-harness models refresh --dry-run
liushi-harness skills evaluate --changed
liushi-harness knowledge check-stale
liushi-harness rules audit --changed
liushi-harness instructions audit --workspace <workspace-id>
liushi-harness memory check-stale --workspace <workspace-id>
liushi-harness agents audit --workspace <workspace-id>
liushi-harness upgrade --dry-run
```

Review Model、Agent、Skill、Policy、Instruction、Memory、Rule、Architecture Mechanism、Connector Capability、Knowledge Drift、指标趋势和 Harness Release。

### 每季度

- 重新 Bootstrap 高变化 Repository。
- 重放代表性历史 Eval。
- Review Protected Path、Owner 和企业 Policy。
- 删除无命中、无 Owner 或长期 Stale 的知识。
- 演练 Recover、Pause、Rollback 和 Uninstall。

## 10. 异常处理

```powershell
liushi-harness pause --workspace <id>
liushi-harness doctor
liushi-harness recover --task <id> --dry-run
liushi-harness mode set report-only
```

发生状态不一致、错误拦截、越权尝试、知识污染或执行器异常时：

1. 停止自动写入和 Connector Publish。
2. 降级到 Report-only。
3. 保留 Worktree、Event、Action Journal 和 Evidence。
4. 生成 Recovery/Incident Report。
5. 修复后重放导致问题的 Fixture 和负向测试。
6. Human 确认后恢复原 Level。

不使用 `git reset --hard`、自动删除 Worktree 或覆盖 Wiki 来“恢复干净”。

## 11. Upgrade 与 Rollback

- 先运行 `upgrade --dry-run` 展示 Managed File 和 Schema Migration。
- 在 Fixture Workspace 运行 Adapter Contract 和历史 Task Eval。
- Backup Runtime Snapshot 和旧 Package Version。
- Human 确认后应用。
- Migration 不可逆或未知字段存在时保持只读。
- 失败回滚 Package、Managed File 和 Schema View，不删除新事件。

## 12. Uninstall 与移交

```powershell
liushi-harness uninstall --dry-run
liushi-harness uninstall --apply <plan-id>
```

- 只删除 Digest 未变化的 Managed File。
- 默认保留 Task、Evidence、Knowledge 和 Changelog。
- Human 修改文件生成手动移交清单。
- Connector Credential 由原系统撤销。
- `--purge-runtime` 单独确认并验证全部绝对路径。

## 13. 团队复用

`harness-onboard` Skill 将同一 SOP 封装为可重复流程：

- 确定性探测项目和执行器。
- 生成 Profile、Policy、ProjectRuleCatalog、ArchitectureMechanismProfile、Instruction Catalog、Memory Policy、Agent Registry、WorkspaceGraph 和 InstallPlan Proposal。
- Human 只确认项目特有差异。
- 使用组织模板但不复制企业业务数据。
- 输出接入报告和未满足能力。

新项目不得直接复制另一个项目的 `.liushi-harness` 目录后使用，必须重新扫描 Revision、Owner、验证和敏感路径。

## 14. 生产成功标准

- 至少 3 个预登记真实 Task。
- HTT 中位数下降至少 25%。
- Cycle Time、返工、缺陷和 Review 轮数不恶化。
- 没有越权写入、静默模型降级和无审批高风险动作。
- Required Verification 和 EvidenceBundle 完整。
- Blocking Rule 无静默违规，Rule Exception 均可追溯且未过期。
- Instruction/Agent Projection 无未处理 Drift，平台 Memory 未被当作 Evidence。
- Candidate 未污染 Active Knowledge。
- Team Member 能按 SOP 独立 Onboard 同类项目。
