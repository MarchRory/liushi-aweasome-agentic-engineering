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

| 能力切片                 | 当前状态      | 已满足基础                                                                                                                                                                                                                                                                                                                                                                                       | 主要缺口                                                                    |
| ------------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Workflow 前置契约        | `implemented` | Task、Artifact、Gate、Approval、Command/Receipt、Replay、Revision、Context、Cell 路由 Policy、固定公开项目 Cell Smoke、精确 Codex TUI Host Smoke                                                                                                                                                                                                                                                 | CLI 全量迁移                                                                |
| Workflow Core            | `partial`     | 固定 Cell、Failure 路由、Human 控制、Aggregate、Reducer、File Store、合法 Command、CodingTask Domain Core、CodingTask Store/Replay、Command Service、显式生产 CLI 单仓绑定、Worktree/Write Set 检查、未知 Provision Human 对账与下游 Guard、Repository Lock、JournaledActionRunner、受控文件变更、Git Checkpoint、ImplementationSubmitted、版本化 Verification Command、单仓 Verification 影响面 | Child 引用、RequirementWorkflow 恢复编排与 Cell Runtime、Worktree 清理/重建 |
| Executor Adapter         | `partial`     | CLI、Composition Root、Codex Probe、Hook Adapter、Windows 交互式 TUI `apply_patch` 正负路径                                                                                                                                                                                                                                                                                                      | 企业安装、版本/平台矩阵、其他工具与 Executor                                |
| Hooks 与 Agent Runtime   | `partial`     | Gate、Canonical Event、Codex Projection/Wrapper、同 invocation 证据绑定和 Host 结果门                                                                                                                                                                                                                                                                                                            | 其他平台、其他生命周期、Role Runtime                                        |
| Verification 与 Evidence | `partial`     | Evidence 基础类型、G8 Verification Check、ProjectProfile-backed 单仓影响面、VerificationPlan、EvidenceBundle、fail-closed Mock、显式 Local Command Runner、版本化 Command/Journal 恢复、Git Revision 绑定、环境/超时/输出限制                                                                                                                                                                    | Import Graph、重试/Flaky、Waiver、Independent Verifier、多仓编排            |
| Instruction Projection   | `designed`    | Rule Core、Profile Bundle                                                                                                                                                                                                                                                                                                                                                                        | Canonical Instruction、Managed Merge Proposal                               |
| Agent Registry           | `designed`    | Model/Role 设计                                                                                                                                                                                                                                                                                                                                                                                  | Registry、Resolution、Eval、平台渲染                                        |
| Skills 与 Connectors     | `designed`    | Scanner、CLI、Digest                                                                                                                                                                                                                                                                                                                                                                             | Registry、Runner、认证、Wiki Adapter                                        |
| Memory 与 Knowledge      | `designed`    | Event/Snapshot/Artifact                                                                                                                                                                                                                                                                                                                                                                          | Memory Store、Retrieval、Curation、Promotion                                |
| 多仓写入与 Worktree      | `partial`     | 多仓身份、Profile、Write Set 规范化、Managed Worktree 创建/检查、未知 Provision Human 对账与下游 Guard、Workspace/Repository 排他 Lock、单仓受控文件变更与 Git Checkpoint                                                                                                                                                                                                                        | Workspace Registry、Worktree 清理/重建、跨仓 Saga、Compensation             |
| 生产安装、升级与卸载     | `partial`     | npm 发布物、跨平台 Tarball Smoke 脚本、Windows 干净安装证据、ESM/CJS、双 CLI Bin、Doctor、许可证门禁、独立 Consumer 驱动固定公开项目 Cell                                                                                                                                                                                                                                                        | Ubuntu CI 运行证据、企业项目安装、Managed Files、Migration、Rollback        |

### 5.1 S3 CodingTask 进展修订

S3 当前已经完成 Domain Core、File Store/Replay、Command Gateway/Service、默认权威授权解析、Managed Worktree Provision/Inspector、未知 Provision Human 对账与下游 Guard、Workspace/Repository 排他 Lock、Action 级执行锁和 Intent-first `JournaledActionRunner`、受控文件变更、可信 Repository Root、Git Checkpoint、ImplementationSubmitted Attempt 收口、Checkpoint 后权威绑定 Verification Target Revision、Verification 版本化命令与 EvidenceBundle、G8 Profile-backed 单仓影响面、fail-closed Mock、显式 Local Command Runner、要求 Workspace/Repository/绝对 Root/Verification Mode 的生产 CLI 单仓 Cell 和单仓 PRReadyArtifact 权威装配。代码与测试已证明 CLI Binding 在副作用前关闭式校验，并由生产 Bootstrap 映射到真实 Composition Root；真实 Git E2E 已验证 G1/G4 Human Approval、Checkpoint、Evidence Passed、PRReadyArtifact 确定性和跨实例零重复副作用。固定公开项目 `unjs/defu@82632b66` 已通过真实 Tarball CLI、两个模拟 Gate、受管 Worktree、预编排单文件 Mutation、唯一 Checkpoint、两个 Required Checks、Passed Evidence、PRReadyArtifact 和跨进程幂等正路径验证；同一项目的 Codex `0.144.0-alpha.4` 交互式 TUI 已通过 Write Set 内正向写入、越界拒绝和 13 项关闭式结果门。证据不把自动化 Approval 计作真实 Human 或 HTT，也不证明 Agent 自主编码和失败修复循环。下一步进入企业项目安装协议、Codex 版本矩阵和 Claude-compatible/CatPaw Adapter；Worktree 清理/重建、失败分类/受限重试和多仓编排仍是后续能力。

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
