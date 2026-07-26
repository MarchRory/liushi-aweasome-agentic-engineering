# 15 能力门驱动的交付路线

## 1. 目标

本路线不设置按周或按月的交付期限。开发顺序由能力依赖、风险、真实验证结果和质量门决定；任何切片只有在代码、文档、测试、发布物和 Human Gate 同时闭合后才进入下一阶段。

首个生产目标保持不变：在真实 TypeScript 前端项目中，让每个需求至少 25% 的确定性工作可自动化，降低 Human Touch Time，同时不牺牲历史业务逻辑确认、风险审批和验证完整性。25% 是首个安全基线，不是最终上限。

## 2. 状态定义

| 状态         | 含义                                             |
| ------------ | ------------------------------------------------ |
| `completed`  | 实现、测试、文档、Changeset 和发布物验证全部通过 |
| `validating` | 主实现已存在，正在真实场景或兼容性测试中         |
| `aligned`    | 技术方案与边界已确认，可以开工                   |
| `designed`   | 设计文档已完成，但前置依赖或开工决策尚未满足     |
| `pending`    | 尚未完成方案或依赖分析                           |

设计文档存在不等于能力已经实现；外部 Coding Agent 在开发本项目时使用的能力也不计入产品完成度。

## 3. 已完成能力

### 3.1 工程与确定性 Core

状态：`completed`

- npm 子包、ESM/CJS、CLI Bin、Changesets、License 和第三方声明。
- Clean Architecture、Composition Root、lower camelCase、纯 Barrel、中文注释和源码复杂度门禁。
- TypeScript 7 原生类型检查与 TypeScript 6 Compiler API 兼容路径。
- append-only Event、原子 Snapshot、File Lock、Replay、Runtime Doctor 和损坏检测。
- Task、Artifact、DecisionRequest、Approval、Gate 和 RFC 8785 Digest。

### 3.2 Rule Core

状态：`completed`

- 严格 Rule Definition、ProjectRuleCatalog 和 RuleResolutionContext。
- `rules resolve`、Scope、冲突、Revision Drift 和 Blocking Validator 可用性检查。
- Candidate、Stale、Rejected 和 Superseded Rule 不进入执行集合。

### 3.3 多仓 Project Discovery 与 Profile Promotion

状态：`completed`

- 显式多仓只读 Scanner，不执行配置、不泄露本机绝对路径。
- JSON/JSONC/YAML 确定性解析、依赖歧义和稳定 Digest。
- 无人工仓数、文件数、目录数、深度或读取字节预算。
- ProjectProfileProposal、不可豁免 G8、精确 Approval 绑定和旧 Revision 防复用。
- `profile compile` 生成多仓 ProjectProfile Bundle 与 repository-qualified Active Rule Catalog。

## 4. 当前决策门

### 4.1 Workflow 对齐

状态：`aligned`

Human、Lead 与六角色评审已经确认：

- Workflow 是需求生命周期的版本化语义内核，不是现有 Task 外层的通用 DAG。
- 首版只实现 RequirementWorkflow 与 CodingTask 两个强一致性边界。
- CLI、Studio 和 CI 写入统一经过 Application Command Gateway。
- 历史业务逻辑、风险操作和上游方案变更必须经 Human Decision。
- Studio 是独立应用且不保存语义真相；先 Tracker 和 Decision Inbox，后 Builder。
- Agentic Workflow 前先完成 Command/Receipt、Replay Fixture、Revision Binding、Context Trust 和 `outcomeUnknown`。

详细方案见 [21 需求生命周期 Workflow 产品与技术方案](./21-requirement-workflow-runtime.md) 与 [ADR-014](./decisions/ADR-014-workflow-semantic-core-and-studio-boundary.md)。Workflow 可以进入前置契约实现，但真实 Executor 仍受 S0-S3 完成门约束。

## 5. 待排序能力切片

以下切片按 Workflow 评审后的依赖顺序推进；无依赖冲突的基础能力可以并行。

| 能力切片                 | 当前状态      | 已满足基础                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | 主要缺口                                                                                                            |
| ------------------------ | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Workflow 前置契约        | `implemented` | Task、Artifact、Gate、Approval、Command/Receipt、Replay、Revision、Context、Cell 路由 Policy、固定公开项目 Cell Smoke、Codex Host Result v2 验证和证据投影实现                                                                                                                                                                                                                                                                                                                                                                                                                                  | CLI 全量迁移                                                                                                        |
| Workflow Core            | `partial`     | 固定 Cell、Failure 路由、Human 控制、Aggregate、Reducer、File Store、合法 Command、CodingTask Domain Core、CodingTask Store/Replay、Command Service、显式生产 CLI 单仓绑定、Worktree/Write Set 检查、未知 Provision Human 对账与下游 Guard、Repository Lock、JournaledActionRunner、受控文件变更、Git Checkpoint、ImplementationSubmitted、版本化 Verification Command、单仓 Verification 影响面、CodingTask Session Activation、Session Hook Binding v2、Session-bound Action Admission、权威 ChangeSet Inspector、ChangeSet/Checkpoint 双向绑定、Closeout Process State/File Store            | S3 Closeout Process Manager 编排与恢复、Child 引用、RequirementWorkflow 恢复编排与 Cell Runtime、Worktree 清理/重建 |
| Executor Adapter         | `partial`     | CLI、Composition Root、Codex Probe、Hook Adapter、G0 InstallPlan dry-run/Apply、Installation Revision、Executor Compatibility Matrix Domain、真实 Codex CLI 0.144.5 Host Result v2、Host 7 条 Evidence Projector、固定 v2 Contract Suite 5 条 ContractTest、写入前 Projection Set 复验、双 Artifact Store、重算查询 CLI、确定性 Publication Bundle、create-only 原子输出 CLI、P3a G6 Domain、P3b Sigstore Sign/Offline Verify、P4a-P4b3 Manifest/Trust Profile、Manifest G6、Signed Manifest、完整离线 Verify、P4c1 严格 Artifact Reader/create-only Writer、P4c2a 企业 HTTPS Authority Adapter | P4c2b 隔离 Release Host 与 CLI 接线、Accepted Head、安装信任门、Claude-compatible/CatPaw、其他工具与 Executor       |
| Hooks 与 Agent Runtime   | `partial`     | Gate、Canonical Event、Codex Projection/Wrapper、同 invocation 证据绑定、Host Result v2 结果门、Session Hook Binding v2、Admission State/Lease、v2 Intent/Observation、Trace 摘要绑定与受其因果绑定的 Resolution                                                                                                                                                                                                                                                                                                                                                                                | 真实 Codex Pilot、其他平台、其他生命周期、Role Runtime                                                              |
| Verification 与 Evidence | `partial`     | Evidence 基础类型、G8 Verification Check、ProjectProfile-backed 单仓影响面、VerificationPlan、EvidenceBundle、fail-closed Mock、显式 Local Command Runner、版本化 Command/Journal 恢复、Git Revision 绑定、环境/超时/输出限制                                                                                                                                                                                                                                                                                                                                                                   | Import Graph、重试/Flaky、Waiver、Independent Verifier、多仓编排                                                    |
| Instruction Projection   | `designed`    | Rule Core、Profile Bundle                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Canonical Instruction、Managed Merge Proposal                                                                       |
| Agent Registry           | `designed`    | Model/Role 设计                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Registry、Resolution、Eval、平台渲染                                                                                |
| Skills 与 Connectors     | `designed`    | Scanner、CLI、Digest                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Registry、Runner、认证、Wiki Adapter                                                                                |
| Memory 与 Knowledge      | `designed`    | Event/Snapshot/Artifact                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Memory Store、Retrieval、Curation、Promotion                                                                        |
| 多仓写入与 Worktree      | `partial`     | 多仓身份、Profile、Write Set 规范化、Managed Worktree 创建/检查、未知 Provision Human 对账与下游 Guard、Workspace/Repository 排他 Lock、单仓受控文件变更与 Git Checkpoint                                                                                                                                                                                                                                                                                                                                                                                                                       | Workspace Registry、Worktree 清理/重建、跨仓 Saga、Compensation                                                     |
| 生产安装、升级与卸载     | `partial`     | npm 发布物、跨平台 Tarball Smoke 脚本、Windows 干净安装证据、ESM/CJS、双 CLI Bin、Doctor、许可证门禁、独立 Consumer 驱动固定公开项目 Cell、Codex Managed File dry-run、G0 Apply 与 Installation Revision                                                                                                                                                                                                                                                                                                                                                                                        | Ubuntu CI 运行证据、Migration、Rollback、Uninstall                                                                  |

### 5.1 CodingTask 与 Session S1-S3 进展修订

CodingTask 当前已经完成 Domain Core、File Store/Replay、Command Gateway/Service、默认权威授权解析、Managed Worktree Provision/Inspector、未知 Provision Human 对账与下游 Guard、Workspace/Repository 排他 Lock、Action 级执行锁和 Intent-first `JournaledActionRunner`、受控文件变更、可信 Repository Root、Git Checkpoint、ImplementationSubmitted Attempt 收口、Checkpoint 后权威绑定 Verification Target Revision、Verification 版本化命令与 EvidenceBundle、G8 Profile-backed 单仓影响面、fail-closed Mock、显式 Local Command Runner、要求 Workspace/Repository/绝对 Root/Verification Mode 的生产 CLI 单仓 Cell、单仓 PRReadyArtifact 权威装配，以及 Executor Compatibility Matrix Domain、Host/Contract 双 Artifact Store 和重算查询 CLI。CodingTask Session Activation S1 已完成独立 Domain、不可变 Activation Record/File Repository、Session 级跨进程 Lease、`Create -> Provision -> StartAttempt` 后权威读取、耐久化 `outcome_unknown`、CLI `coding-task session activate`、跨实例复用和真实 Git E2E。S2 已完成 Session Hook Binding v2、Admission State/File Store、非等待 Lease、Activation 自动初始化、PreAction 健康 v2 Intent 准入，以及 PostAction Trace、Trace 摘要绑定的 v2 Observation 与受其因果绑定的 Resolution 闭合；缺失 Post、未完成 Human/Retry 状态和跨 Store 提交未知都会阻断 Closing 或进入 `outcome_unknown`。S3 已完成提交前 Snapshot 与提交后 Commit ChangeSet 的独立重建、摘要双向绑定、提交前漂移零副作用拒绝和已存在 Checkpoint 幂等恢复；Closeout Process State/File Store 已持久化完整阶段证据并提供 CAS 与未知结果分类。完整 Process Manager、Session Action/Trace 覆盖门、恢复 Use Case、Verification 与 PRReady 串联仍未完成。`waiting_agent` 只允许动作继续竞争 Admission，不是脱离 Hook 的写入授权。CLI 的 Root 与 Actor 仍只是操作员启动声明；真实 Pilot 前必须由企业包装器或 Human 批准 Registry 注入可信 Runtime Binding。固定公开项目 `unjs/defu@82632b66` 的预编排 Smoke、自动 Approval 和 Composition Root E2E 均不构成真实 Codex Pilot。

Codex 兼容性路径现已把 Host Projector 的 7 条 Evidence 与确定性 Contract Suite 的 5 条 ContractTest 合并为 12 条；真实 Codex CLI `0.144.5`、Windows x64、Interactive TUI 的受验输入已全部 Passed，编译为本机 `compatible` Matrix，并通过 Query 重算。确定性 Publication Bundle 已绑定 Tarball、源码 Revision、双 Artifact、12 条 Evidence、Policy 和 Matrix，并可由 create-only CLI 原子写出；P3a 已新增固定发布者身份、Release Candidate、Human G6 摘要复验和未签名 in-toto Draft，P3b/P4b3 已交付包内 Sigstore 签名、内容寻址 Artifact、确定性 Manifest、Consumer Trust Profile、独立 Manifest Human G6、可信 Release Approval Authority 边界，以及公开的完整双 DSSE 离线验证链。P4c1 已交付包内严格 canonical Artifact Reader 和受信输出根约束下的 create-only Writer，不设置任意企业文件大小预算；P4c2a 已交付固定身份的企业 HTTPS Authority Adapter。Authority 只按审批主题与制品摘要查询权威记录；为避免同进程伪造 Authority 后滥用环境凭据，npm 根和 `HarnessApplication` 不暴露 Signer、Sign UseCase 或 Authority 工厂。Release Host、Accepted Head 和安装信任门已冻结，不再作为下一实现门。下一步固定为 S3 Closeout，再开展真实 Codex Pilot；之后才评估 Claude-compatible/CatPaw Adapter。没有真实 Pilot 与完整 Closeout 证据时绝不声明生产闭环；固定公开项目 Smoke、自动化 Approval、Activation 和 Composition Root E2E 都不构成真实 Codex Pilot。Rollback/Uninstall、Worktree 清理/重建、失败分类/受限重试和多仓编排仍是后续能力。

## 6. 每个切片的统一开工门

开工前必须具备：

1. 明确用户价值、输入、输出、状态和非目标。
2. 与现有 Domain/Application 边界无职责重叠。
3. 风险操作和 Human Decision 点已经确定。
4. Codex、Claude-compatible 与 Generic Core 的可移植边界清楚。
5. 复用的开源能力、标准和自研部分有清单。
6. Unit、Integration、E2E、Architecture 和发布验证方案可执行。
7. 文档状态从 `designed` 更新为 `aligned`。

## 7. 每个切片的统一完成门

- 严格 Schema、稳定错误码、Digest 与 Replay 行为通过测试。
- 所有风险动作 fail closed，Human Approval 精确绑定且不可错误复用。
- TypeScript 7、TypeScript 6 API、ESLint、Prettier 和架构门禁通过。
- Unit、Integration、E2E 和 Negative Test 覆盖关键失败路径。
- npm tarball 干净安装、ESM/CJS、CLI 和 License 验证通过。
- README、技术方案、实现状态矩阵和 Changeset 与代码一致。
- 不存在把目标设计描述为当前生产能力的文本。

## 8. 真实项目验证

生产能力不能只靠仓库内 Fixture 宣布完成。每个垂直切片需要在脱敏或可公开复现的真实项目场景验证：

- Human Touch Time 和等待时间。
- 自动完成步骤占比与返工率。
- Human Gate 命中率、误报率和错误放行数。
- Requirement、Plan、Diff 和 Evidence 的一致性。
- Context 恢复成功率和重复调查时间。
- Codex 与 Claude-compatible 路径的行为差异。

发生风险误判、审批错误复用、状态无法恢复或验证证据缺失时，立即退回 Report-only 或 Human-driven 模式，不以自动化率为由放宽 Gate。

## 9. 明确不以时间换取的事项

- 不跳过历史业务逻辑和改动方案确认。
- 不用 Prompt 文本代替 Core Policy、Digest、State Machine 或 Gate。
- 不为提高演示自动化率执行未知命令、自动合并、发布或写 Wiki。
- 不静默降级顶层模型、Validator、Executor Capability 或审批要求。
- 不用任意扫描数量预算截断企业级仓库；资源治理使用可取消执行、流式处理和可观测性设计。
