# 15 四周开发路线

## 1. 目标

四周内交付可在真实 TypeScript 前端项目使用的 `liushi-harness` 生产候选版本，并以至少 3 个真实 Task 验证 HTT 中位数下降 25%。

路线按垂直闭环组织，不等全部模块写完才接入真实项目。第 2 周开始真实试用，后续功能围绕实际失败补齐。

## 2. 范围原则

- Codex Production Path 优先。
- Claude-compatible/CatPaw 保留真实兼容验证，不承诺首月能力对等。
- 单仓写入是 Golden Path，多仓先解决读取和影响分析。
- Wiki Read/Search/CreateDraft，Publish 默认关闭。
- Learning 自动生成 Candidate，不自动 Promotion。
- 不开发 Dashboard、Daemon、Cloud Control Plane 和自动 Merge/Release。
- 每周保留约 20% 时间处理真实接入暴露的问题。

## 3. Week 1：工程与确定性核心

### 目标

建立能安全持久化、恢复和拒绝非法状态迁移的 CLI Skeleton。

### Deliverables

- pnpm Workspace、TypeScript、ESLint、Prettier、Vitest 和 Build。
- Conventional Commit、Commitlint、Husky、lint-staged 和 Changesets。
- 模块化单体目录和 Architecture Test Skeleton。
- Core Enum、Artifact Envelope、Evidence、Approval 和 Proposal Schema。
- RuleDefinition、ProjectRuleCatalog、ArchitectureMechanismProfile、RuleComplianceReport 和 Exception Schema。
- 确定性 Rule Resolver、Scope/优先级合并和 ApplicableRuleBundle Digest。
- InstructionDefinition、MemoryCandidate、AgentDefinition 和 ProjectionManifest Schema。
- Instruction/Agent Registry、Managed Projection 和 Memory Policy Skeleton。
- Task 正交状态机和 Gate Engine 最小实现。
- File Event Store、Snapshot、Task Lock 和 Action Journal。
- CLI `doctor`、`workspace create`、`task create`、`task status`。
- Installer Ownership、`--dry-run` 和 Conflict Fixture。

### 纵向 Use Case

```text
task create
  -> append event
  -> write snapshot
  -> process restart
  -> task status from replay
```

### Exit Gate

- Windows 上 Event Replay、Atomic Snapshot 和双进程锁测试通过。
- 非法 State Transition 被确定性拒绝。
- Rule Resolution 在重复运行、路径顺序变化和进程重启后产生相同 Bundle Digest。
- Instruction/Agent Registry 和 MemoryCandidate Schema Compatibility Test 通过。
- Managed File 不覆盖未知文件。
- Format、Lint、Typecheck、Test、Architecture Test 和 Build 全部通过。
- 无业务代码进入 Infrastructure/Common 错误层级。

## 4. Week 2：Codex 垂直交付闭环

### 目标

在一个真实项目完成 Requirement 到 Review-ready，不要求 Harness 自动合并。

### Deliverables

- Codex Capability Probe、Plugin/Profile、Skills 和 Command Hooks。
- Codex `AGENTS.md` Compiler、Agent TOML Renderer 和 Discovery Probe。
- Agent Registry Resolver、AgentInstance Digest 和最小 Task Working Memory。
- Project Scanner、Rule/Mechanism Candidate Scanner 和 Human-confirmed ProjectProfile。
- ProjectRuleCatalog、ArchitectureMechanismProfile、RuleBundle 编译和 G8 Gate。
- Requirement Battle、RequirementContract 和 G1 Approval。
- PlanRisk、Write Set 和历史业务逻辑触发。
- Worktree 和批准范围内 Implementation。
- Project Validator Runner、RuleComplianceReport 和 EvidenceBundle。
- Independent Verifier 最小 Role。
- 第一个真实低风险 Task。

### Exit Gate

- Codex 正向、负向和权限 Contract 通过。
- 从新 Session 可以 Resume Task。
- 新 Session 加载同一 InstructionBundle、AgentInstance、RuleBundle 和 Memory Selection Digest。
- 未批准 Requirement 无法进入 Implementation。
- 越过 Write Set 的命令或文件修改被阻止。
- Blocking Rule Violation、未确认机制偏离和过期 Rule Exception 不能提交 Artifact。
- Required Check 失败不能生成 Review-ready。
- 真实 Task 有完整 HTT、Cycle 和 Evidence 数据。

## 5. Week 3：复杂上下文与兼容路径

### 目标

覆盖多仓只读、公共层、企业 Wiki 和候选学习，并验证 Claude-compatible/CatPaw 能力边界。

### Deliverables

- WorkspaceGraph、Repository Role、Dependency Edge 和 Revision Drift。
- 多仓 Read Set、公共层影响分析和单仓 Write Lock。
- Wiki/MCP Read、Search、Provenance 和 Prompt Injection 防护。
- Wiki CreateDraft，不启用默认 Publish。
- Context Scout、Solution Risk Reviewer 和 Learning Curator。
- LearningCandidate Store、重复失败阈值和 G7 Promotion Draft。
- `memory-curator`、Memory Retrieval Index、Candidate Destination 和 Obsidian Projection。
- Claude-compatible `CLAUDE.md`/Path Rule/Agent Renderer 和 Managed Projection。
- Model Routing、Frontier 不降级和子角色升级。
- Claude-compatible Adapter Contract。
- CatPaw 真实 Probe、Smoke 和 Negative Test。
- 第二个真实 Task，优先选择涉及历史逻辑或公共层读取的需求。

### Exit Gate

- 多仓读取不扩大 Write Set。
- 历史逻辑触发 G2，未确认时停止。
- Wiki 内容不能改变 Tool Permission 和 Gate。
- Candidate 不进入 Active Context。
- 平台 Memory Claim 不能作为 Evidence，MemoryCandidate 不自动晋升。
- Claude-compatible Instruction/Agent Projection 与 Capability 声明一致。
- CatPaw 支持声明与实际 Capability 一致。
- Frontier 不可用时 Orchestrator 进入 WAITING_HUMAN。

## 6. Week 4：生产硬化与发布

### 目标

完成三个真实 Task、证明指标、完成升级卸载和 npm 发布候选。

### Deliverables

- 第三个真实 Task 和三个 Task 的对照数据。
- Recovery、Pause、Report-only、Upgrade、Repair 和 Uninstall。
- Flaky、Waiver、Partial Action 和 External Change Fixture。
- Skill/Knowledge Candidate Eval 和人工 Promotion 演练。
- Rule/Pattern/Validator Candidate Eval、G7 Promotion 和 G8 Exception 演练。
- Instruction/Agent Candidate Promotion、Projection Drift 和 Memory Purge 演练。
- Package Content、License、SBOM、Provenance 和 Changelog 检查。
- Codex Production Capability Report。
- Claude-compatible/CatPaw 支持矩阵和已知限制。
- Production Adoption SOP 演练。
- `0.1.0-rc` npm Package 和 Release Notes。

### Exit Gate

- 3 个预登记真实 Task 完成。
- HTT 中位数下降至少 25%。
- Cycle、返工、缺陷和 Review 轮数不恶化。
- 无越权写入、无静默降级、无自动高风险审批。
- 三个 Task 均有可追溯 RuleBundle 和完整 RuleComplianceReport。
- 三个 Task 均可恢复 Instruction、Agent 和 Memory Selection Digest。
- Crash/Recovery、Upgrade 和 Uninstall Fixture 通过。
- npm Pack 只包含 Allowlist 文件，无企业数据或 Credential。
- 新项目可以用 Onboarding Skill 生成可 Review 接入计划。

## 7. 每日节奏

建议单人主开发节奏：

- 上午：实现当日纵向 Use Case 和确定性测试。
- 下午：在真实项目或 Fixture 执行并记录失败。
- 下班前：更新 ADR、Risk、Eval 和次日唯一 Critical Path。

每个工作日必须保持 Main Branch 可 Build；不允许连续多天只增加抽象而没有可执行路径。

## 8. Critical Path

```text
Contracts
  -> State/Gates
  -> Rules/Resolver
  -> Instructions/Agent Registry
  -> Store/Recovery
  -> CLI
  -> Codex Adapter
  -> Working Memory
  -> Requirement/Plan
  -> Worktree/Implementation
  -> Verification/Evidence
  -> Real Tasks
```

Workspace、Wiki、Learning 和第二执行器不能阻塞 Week 2 的单仓 Codex 闭环。

## 9. 测试分配

| 风险           | 必需测试                                     |
| -------------- | -------------------------------------------- |
| Artifact/Gate  | Unit、Property、Schema Compatibility         |
| Event Store    | Fault Injection、Replay、Cross-process       |
| Filesystem     | Windows/macOS/Linux Path 和 Ownership        |
| Adapter        | Contract、Smoke、Negative Permission         |
| Hooks          | Event Mapping、Timeout、Reentry、Fail Policy |
| Rules          | Scope、Precedence、Digest、Exception、Drift  |
| Instructions   | Scope、Budget、Projection、Ownership、Drift  |
| Memory         | Destination、Retrieval、Secret、TTL、Resume  |
| Agent Registry | Model、Permission、Skill、Schema、Projection |
| Multi-repo     | Lock Order、Drift、Partial Saga              |
| Wiki/MCP       | Auth Scope、Revision、Injection、Idempotency |
| Model          | Deny、No-downgrade、Escalation、Eval         |
| Learning       | Trigger、Counterexample、No-auto-promotion   |

## 10. 实际 Task 选择

三个 Task 预登记且难度递增：

1. 低风险、单仓、验收清楚的前端需求。
2. 需要理解历史行为或公共层读取的需求。
3. 包含 UI/E2E、复杂验证或 Wiki Context 的正常生产需求。

不能在结果不理想后替换 Task。Blocked、Waiver 和失败都进入指标。

## 11. 指标采集

每个 Task 记录：

- Human Active Time，按 Requirement、Plan、Implementation、Review、Rework 分类。
- Agent Wall Time、调用次数和模型路由。
- Cycle Time 和 WAITING_HUMAN 时间。
- First-pass Verification、Retry、Finding 和 Waiver。
- Diff、Review 轮数和 Production Defect。
- Setup/Repair 成本。

成功判断使用预登记统计口径，不使用主观“感觉更快”。

## 12. 风险与止损

| 风险              | 止损动作                                   |
| ----------------- | ------------------------------------------ |
| Store/Lock 不稳定 | 并发保持 1，暂停真实自动写入               |
| Hook 覆盖不足     | 强制 CLI/CI Gate，降级 Assisted            |
| CatPaw 能力不足   | 标记 Experimental，不阻塞 Codex            |
| Wiki 权限复杂     | 只保留 Read 和本地 Draft                   |
| Approval 过多     | 合并低风险 Plan Scope，不削弱 Hard Gate    |
| Learning 污染     | 关闭 Promotion，只记录 Candidate           |
| 平台投影漂移      | 停止更新 Managed File，生成 Three-way Diff |
| 指标未改善        | 分析 Human 等待和返工，不扩功能范围        |

## 13. 明确延期

- Web Dashboard 和文档站实现。
- Daemon、Queue 和 Cloud Scheduler。
- 自动 Merge、Release 和 Deploy。
- 跨仓原子事务。
- 自动 Skill/Knowledge Promotion。
- Codex/Claude 平台 Memory 双向同步。
- 通用多 Agent Team 和嵌套委派。
- 完整 Obsidian Plugin。
- 企业级远程 Telemetry Backend。

未来建站可以消费技术方案、ADR、Package `CHANGELOG.md`、Capability Matrix 和本地匿名化 Eval Report，但不能反向成为运行时 Source of Truth。

## 14. 月末交付清单

- npm `liushi-harness@0.1.0-rc`。
- Source、Schema、CLI、Skills、Hooks、Profiles 和 Adapter。
- 00-19 技术方案与 ADR。
- Codex Production Report。
- Claude-compatible/CatPaw Compatibility Report。
- 三个真实 Task Evidence 和匿名化指标摘要。
- Onboarding、Recovery、Upgrade、Uninstall 和 Release Runbook。
- 已知限制、延期项和下月候选 Backlog。
