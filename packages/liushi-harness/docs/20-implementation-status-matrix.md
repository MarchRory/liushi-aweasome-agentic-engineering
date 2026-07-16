# 20 文档与实现状态矩阵

## 1. 目的

本矩阵分别回答技术方案是否写出、边界是否完成评审、产品能力是否实现。三者不能互相替代。文档完整不等于代码完成；开发过程中使用外部 Coding Agent 或脚本，也不等于 `liushi-harness` 已提供对应运行时能力。

## 2. 状态口径

| 状态          | 判定标准                                         |
| ------------- | ------------------------------------------------ |
| `implemented` | 代码、测试、文档、Changeset 和发布物均提供该能力 |
| `partial`     | 已有可复用产品能力，但文档中的完整闭环尚未实现   |
| `designed`    | 方案主体已经写出，尚无对应产品实现               |
| `pending`     | 仍需 Human/Lead 对齐关键边界，不能直接开工       |

## 3. 06-19 审计结果

| 文档                        | 方案状态 | 实现状态      | 当前可验证能力                                                                                                                                                                                                                                                                                                                                                                                                                 | 尚未实现或待确认                                                                                                                |
| --------------------------- | -------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| 06 代码库组织               | 已完成   | `implemented` | 分层、循环依赖、目录、命名、Barrel、行数、TSDoc、中文注释、ESLint、Prettier、TS7/TS6 和 Changesets 门禁                                                                                                                                                                                                                                                                                                                        | 目标目录中的未来模块不计为能力                                                                                                  |
| 07 Workspace 与多仓         | 已完成   | `partial`     | 多仓身份、只读扫描、依赖歧义、Profile Proposal、G8、Profile Bundle、Managed Worktree 创建/检查、未知 Provision Human 对账与下游 Guard、Workspace/Repository 排他 Lock、单仓受控文件变更、可信 Repository Root 与 Git Checkpoint                                                                                                                                                                                                | WorkspaceGraph Registry、Worktree 清理/重建和跨仓 Saga                                                                          |
| 08 Executor Adapter         | 已完成   | `partial`     | Codex Probe、Hook Binding、Pre/Post Adapter、CLI Wrapper、`hooks.json` 投影、G0 InstallPlan dry-run、G0 Apply、Installation Revision、Executor Compatibility Matrix Domain、真实 Codex CLI 0.144.5 Host Result v2、Host 7 条 Evidence Projector、固定 v2 Contract Suite 5 条 ContractTest、双 Artifact Store、重算查询 CLI、确定性 Publication Bundle、create-only 原子输出 CLI、Fixture 测试和固定公开项目生产 CLI Cell Smoke | G6/Sigstore Attestation、Trusted Release Manifest、安装信任门、Rollback/Uninstall、Claude/CatPaw Adapter、Role Invocation       |
| 09 Hooks 与 Agent Runtime   | 已完成   | `partial`     | Canonical Pre/PostAction、Codex `apply_patch` Projection/Wrapper、PlanRisk/Human Gate 授权、Dispatcher、Action Journal、Worktree Journaled Runner 与 Trace                                                                                                                                                                                                                                                                     | Verification Runner 接入、其他平台 Projection、自动安装、其他生命周期、Role Runtime 和 Human Battle                             |
| 10 模型路由与 Eval          | 已完成   | `designed`    | 无产品运行时能力                                                                                                                                                                                                                                                                                                                                                                                                               | Model Registry、Router、升级、Eval Dataset 和成本策略                                                                           |
| 11 Skills 与 Connectors     | 已完成   | `designed`    | Scanner、CLI 和 Digest 可供未来复用                                                                                                                                                                                                                                                                                                                                                                                            | Skill Registry/Runner、MCP、Wiki、Issue、Obsidian、认证和写入 Gate                                                              |
| 12 Verification 与 Evidence | 已完成   | `partial`     | G8 Profile Check、单仓确定性影响面、VerificationPlan、Local Command Runner、版本化 Verification Command/Journal 恢复、Git Revision 绑定、环境/超时/输出限制、EvidenceBundle 强一致 Store、幂等/冲突/篡改检测                                                                                                                                                                                                                   | Import Graph、Flaky、G5、Independent Verifier 和多仓验证                                                                        |
| 13 Learning 与 Knowledge    | 已完成   | `designed`    | 无产品运行时能力                                                                                                                                                                                                                                                                                                                                                                                                               | Candidate Store、Eval、Promotion、Retrieval、Curator 和 Skill 改进                                                              |
| 14 生产 SOP                 | 已完成   | `partial`     | npm、Tarball 干净安装 Smoke、ESM/CJS、双 CLI Bin、Doctor、Task、Artifact、Approval、Rule、Scanner、Profile Compile、Codex Probe、G0 InstallPlan dry-run、G0 Apply、Installation Revision、固定公开项目 Cell 证据，以及交互式 Host Smoke Prepare/Result Gate                                                                                                                                                                    | Rollback/Uninstall、企业自动安装、自动 Task Delivery、Executor、Workflow、Memory、Learning 和长期治理命令                       |
| 15 交付路线                 | 已完成   | `implemented` | 能力门、决策门、完成门和真实项目验证口径                                                                                                                                                                                                                                                                                                                                                                                       | Workflow 后的切片顺序等待对齐                                                                                                   |
| 16 Rules 与代码合规         | 已完成   | `partial`     | Rule Schema、Catalog、Resolver、Scanner Candidate、G8 Profile Promotion                                                                                                                                                                                                                                                                                                                                                        | Validator Execution、ComplianceReport、Rule Exception、Pattern/Mechanism Registry 和编码期执行                                  |
| 17 Instruction Projection   | 已完成   | `designed`    | Rule/Profile 前置基础已具备                                                                                                                                                                                                                                                                                                                                                                                                    | Canonical Instruction、Resolution、Managed Merge Proposal 和三平台 Projection                                                   |
| 18 Memory Runtime           | 已完成   | `partial`     | Task Event、Snapshot、Artifact、Approval 和 Replay                                                                                                                                                                                                                                                                                                                                                                             | Working/Project/Organization Memory、Retrieval、Compaction、Curation 和 Obsidian/Wiki                                           |
| 19 Agent Registry           | 已完成   | `designed`    | 无产品运行时能力                                                                                                                                                                                                                                                                                                                                                                                                               | Registry、Resolution、Permission、Skill/Memory 绑定、Eval、平台渲染和 Runtime                                                   |
| 21 Workflow 产品与技术方案  | 已完成   | `partial`     | Command Gateway、Revision/Context、Replay、Timeline、Action Journal、Trace、Canonical Hook Core、RequirementWorkflow/CodingTask Aggregate 与 File Store、权威授权、单一 CodingTask CLI Cell、Managed Worktree、未知 Provision Human 对账与下游 Guard、受控文件变更、Git Checkpoint、ImplementationSubmitted、版本化 Verification Command、单仓影响面、PRReadyArtifact                                                          | 其余 CLI 迁移、Child Workflow、完整 Workflow Cell Runtime、平台 Hook/Executor、实时 Trace/Exporter、Worktree 清理/重建与 Studio |

### 3.1 本轮 S3 修订

本轮代码已将 `CodingTask Domain Core` 扩展为可调用的编码 Cell 持久化切片：

- `FileCodingTaskRepository` 提供严格 Event Schema、append-only JSONL、Hash Chain、目录 Locator 身份校验、锁、Replay 和 `outcomeUnknown` 边界。
- `CodingTaskCommandService` 通过 Application Command Gateway 提供 Create、Attempt、Verification、Human Control 和 Human Resolution 命令。
- 默认 Composition Root 通过上游 Task Replay 重算 PlanRisk、Business Logic G2、Approval 和 Write Set；调用方提交的 `ExecutionAuthorization` 只作为引用，不能绕过 Human Gate。
- 候选事件的非法状态返回 `InvalidStateTransition`；已提交日志的非法状态仍按 `CorruptStore` 处理。
- `WorktreeInspectorPort` 通过 `shell=false` 的 Git Command Runner 只读读取真实 Worktree，检查 Root containment、分支、Base Revision、完整状态和 Write Set 越界；异常只返回稳定诊断码，不泄露本机路径或命令输出。
- `VerificationPlan`、`VerificationExecutorPort` 和 `RunVerificationUseCase` 已定义验证边界；EvidenceBundle 绑定 Plan/Revision/Digest。默认 Mock 不执行命令；生产 CLI 只有显式 `local_command` 才启用本地执行，并验证 Git Revision、工作目录、环境、超时和输出。
- `RepositoryLockPort`、`AcquireRepositoryLockUseCase` 和 `NodeRepositoryLockAdapter` 已提供 Workspace/Repository 互斥；锁竞争错误不返回本机路径，Lock 句柄释放不执行任何 Git 或文件业务写入。
- `JournaledActionRunner` 已提供 Action 级跨进程执行锁、Intent-first 执行、完成态复用、`intent_recorded` 禁止自动重放、`retry_permitted` 受控重试、已有 Observation 的 Resolution 恢复，以及执行后 Journal 闭合失败的 `action_journal_commit_outcome_unknown`。
- `WorktreeProvisionCommandService` 已将 Runtime Root 摘要、CodingTask 权威授权、Repository Lock、Action Journal、真实 Git 创建和 Inspector 后置条件串成版本化写链路；未知结果必须由 Human 恢复检查。
- `AssessWorktreeProvisionRecoveryUseCase` 与 `WorktreeProvisionRecoveryCommandService` 已从可信 Root 联合检查路径、Registry、分支和 Worktree 状态；Human Command 必须绑定锁内重算的 Assessment Digest，且恢复过程不执行 Git 写入。
- `ImplementationCommandService` 已在权威授权、Write Set、Repository Lock 和 Action Journal 边界内提供受控文件创建、替换与删除，并以摘要后置条件确认结果。
- `VerificationCommandService` 已把 Verification 执行、EvidenceBundle 持久化和 CodingTask 结果接纳串成版本化 Journaled Command；未知结果禁止自动猜测。
- `SelectVerificationPlanUseCase` 已从 G8 Profile、CodingTask 最新 ImplementationSubmitted 和 Ready Rule Bundle 生成单仓确定性 Plan；Rule Target 覆盖或 Blocking Validator 映射不完整时关闭式阻断。
- `ImplementationSubmissionService` 已通过启动期可信 Repository Root、Managed Worktree 与原生 Git 创建单一 Checkpoint，以 `ImplementationSubmitted` 收口 Attempt；Git/Event 非 ACID 中间态只能由 Human 检查和接纳。
- `FileEvidenceBundleStore` 已提供不可变 Bundle 持久化、跨实例读取、同 Run 幂等/冲突、Domain 重校验、Digest 重算和提交未知态。
- `cell run` 已要求 Workspace、Repository、绝对 Repository Root 和 Verification Mode；生产 Bootstrap 将绑定映射到静态 Root Resolver 与 Composition Root，并在任何副作用前校验 Manifest Create 身份、全部 Repository Runtime Root 和受管 Verification Worktree Root。Application 可以在不配置绑定时为其他命令创建，但 Cell 执行入口必须关闭式拒绝无绑定调用；Human Gate 保持权威重算。

因此，表格中 CodingTask Store/Command 的旧描述以本节为准；固定公开项目的预编排 Mutation CLI 正路径已有动态验证快照。历史 Codex Host Smoke 只保留旧版结果，不能作为 Host Result v2 Artifact；2026-07-16 已重新执行真实 Codex CLI `0.144.5` v2 Host，并通过 Compile/Query 形成本机 `compatible` Matrix。确定性 Publication Bundle 与 create-only 原子输出 CLI 已实现，但 G6、签名、发布 Manifest 和安装信任门仍未实现。Worktree 清理/重建、Import Graph、重试/Flaky、Waiver、多仓影响传播、真实 Agent 编码、企业安装和 Studio 仍未实现。

### 3.2 Managed File G0 Apply / Installation Revision

本轮已将 Codex Managed File 从只读 InstallPlan dry-run 扩展为可审计的 G0 Apply 闭环：

- `init --apply <plan-ulid> --plan-digest <sha256> --workspace <id> --repository <id> --actor-id <id> --idempotency-key <key> [--store <path>] [--json]` 是已实现命令；六个批准字段均为必填，`actor-id` 只声明审计身份，不提供认证机制。
- Apply 在 Repository Lock 内读取并验证不可变 InstallPlan，查找同一 Approval Revision，执行全量 preflight 和 preimage 采集，并在任何 Repository 写入前持久化 Installation Revision Intent。
- Intent 之后按逐文件原子写入、`FileApplied` checkpoint、Manifest 原子写入、`ManifestApplied` checkpoint、后置验证、`PostconditionsVerified` 和 `Committed` 顺序推进。Runtime Store 中的 `Committed` Installation Revision 是权威所有权证据，Repository Manifest 自声明不可信。
- 同一已提交 Approval 幂等返回 `Reused`；物理文件和 Manifest 已全部达到 after 状态但 checkpoint 未闭合时只补齐元数据。Partial、Mixed、Unknown、Conflict、Existing Human File、Digest 漂移、未知文件类型和符号链接均 fail closed，必须 Human 处理，不盲目重试或自动回滚。
- Windows/POSIX 路径与文件系统差异位于 `platformCompatibility`/Infrastructure，Domain/Application 不混入操作系统判断。Apply unit、filesystem/Revision Store integration、完整 lifecycle integration 和 CLI E2E 已覆盖；POSIX mode 测试在 Windows 跳过。
- Rollback、Uninstall 和 CLI recovery 命令仍未实现；当前 Installation Revision 的 preimage 与 checkpoint 只作为恢复证据。

### 3.3 Executor Compatibility Matrix 与 Codex 证据投影

本轮已建立后续 Codex 版本矩阵和 Claude-compatible/CatPaw Adapter 共用的确定性语义内核，并落地 Codex 来源证据投影、不可变持久化和重算查询：

- `ExecutorHostScope` 精确绑定 Adapter、实际 Distribution、Adapter Digest、执行器版本、Host Surface、OS/Architecture，以及可选 Model、Permission 与 Configuration Digest，不允许跨 Scope 继承 Evidence。
- CatPaw 建模为 `ClaudeCompatible Adapter + CatPaw Distribution`，不能继承 Claude Code 或 Codex 的支持声明。
- `ExecutorCapabilityEvidence` 使用枚举化 Capability、Kind、Outcome 和 Qualifier，并强制绑定原始 Artifact Digest、Schema、Checks、审计时间与安全 Locator。
- `managed_file_mutation_hooks.v1` Policy 明确 Production 是 Compatible 的严格超集；静态 Probe 不能独立产生 Production。
- Compiler 对 Missing、Failed 与 Conflicting Evidence 分别处理：部分通过为 `experimental`，明确失败为 `unsupported`，缺失或冲突为 `unverified`；后二者均不得进入生产路径。
- Evidence 时间只用于审计，不执行固定时间失效算法。Matrix 与 Policy 使用 RFC 8785 SHA-256，输入重排不改变结果。
- Matrix 重校验必须提供受信 Policy 与完整 Evidence 集，并通过重新编译比较预期摘要；零 Evidence 或自报 Assessment 不能伪造 Production。外部 Evidence Locator 只暴露与 `source.artifactDigest` 精确绑定的内容寻址 Artifact URN，不在 Domain 接受任意网络 URL。
- Codex Compatibility Evidence Projector 会重新校验 Prepare v5、Activation Plan v2 和 Host Result v2 的 Schema、摘要、身份、固定 Probe 命令、13 项 Host 检查、时序及运行时环境绑定。Host Result v2 只返回 `hostEvidenceVerified=true` 和 `matrixSupportClaim=not_evaluated` 等受验字段，不自行声明 Matrix 支持等级；`verify-result` 运行时读取 Node platform/arch，并要求与 Prepare Manifest 精确一致。
- 当前 Codex 精确 Scope 只包含 Codex Adapter、Codex CLI Distribution、npm Tarball/Adapter Digest、Codex 版本、Interactive TUI、实测 OS/Architecture 和配置 Digest；不会从 Activation Plan 推断 Model 或 Permission。Package/Adapter Digest 只是内容身份，不是 Tarball Attestation。
- Host Projector 固定输出 1 条 StaticProbe、4 条 SmokeTest 和 2 条 NegativeTest；Application 再用其精确 Scope、Host Artifact Digest 和唯一动态观察锚点，通过生产 `NodeHookInputReaderAdapter` 与 `CodexHookAdapter` 运行固定五 Case v2 Contract Suite，生成独立 Contract Artifact 与 5 条 ContractTest。
- Compile 要求 Host 7 条与 Contract 5 条组成恰好 12 条唯一 Evidence，并在任何 Store 写入前通过与 Query 共享的 Projection Set Verifier 校验 exact Schema、`hostArtifactDigest`、Scope 和 `observationAnchor`。合成/受验输入全部 Passed 时编译 `compatible`；Contract Check 的有效 Failed Evidence 编译 `unsupported`。
- `executor compatibility compile/query` 只接受三份原始 Host JSON 或精确 Matrix Digest；Application 固定选择受信 Policy，并按 Host、Contract 顺序返回两项 `evidencePersistences`。File Store 独立内容寻址保存两种 Artifact；共享 exact-schema verifier 要求各恰好一份，来源复验后再校验父摘要、Scope 和观察锚点，Compile 只持久化复验返回值，Query 则据此重编译。
- 当前没有 ProductionE2e，Scope 没有 `modelId` 或 `permissionMode`，也没有 Tarball Attestation，绝不声明 `production`。真实 Codex CLI `0.144.5` 的本机 Matrix 只支持其精确 Scope；不能把它、合成 Fixture、投影器、Store/CLI 实现或历史旧版 Host Smoke 外推为其他版本、其他平台或可发布版本矩阵。

## 4. 当前产品边界

当前 npm 包实际提供：

- Runtime Store 健康检查。
- Task 创建、查询、Event Replay 和 Snapshot 完整性校验。
- 严格 Artifact Proposal、DecisionRequest、Human Approval 和 Gate。
- Rule Catalog 解析与 ApplicableRuleBundle Resolution。
- 显式多仓只读 Project Discovery。
- Human-gated ProjectProfile Proposal、G8 和 Profile Bundle 编译。
- ESM/CJS Library、`liushi-harness` 与 `lh` CLI。
- 版本化 Command/Receipt 和 Workflow S0 值对象的纯确定性契约。
- V1 Task Event 到语义摘要的 Golden Replay Fixture。
- 从权威 Event 历史生成且可供 Tracker 消费的版本化 Task Timeline Projection。
- 具备独立锁、Hash Chain、幂等追加、跨实例重放和恢复查询的持久化 Action Journal。
- 带 Action 级跨进程执行锁的 Intent-first Journaled Action 内核：Executor 调用前落盘、只在明确重试许可下重放、确定性补写 Resolution，并在执行后 Journal 无法闭合时阻断自动重试。
- 可丢失、可过滤、不会反向修改语义状态的完成态 Trace Span Observation。
- 使用原子 Reservation、独立 Lock 和稳定 Receipt 的持久化 Application Command Gateway。
- 执行器无关的 Canonical Action Hook 契约与 Dispatcher，并通过 PlanRisk Write Set、风险等级和精确 Human Approval 授权文件动作。
- PreAction Intent、PostAction Observation/Resolution 与完成态 Trace 的统一因果链。
- Codex `apply_patch` 的 Hook Workspace Binding、PreToolUse/PostToolUse Adapter、原生 stdin/stdout Wrapper 和确定性 `hooks.json` 配置投影。
- Codex 静态 Capability Probe：版本、帮助输出、命令处理器和 Hook/Native stdin 声明的版本化报告；不可执行或未知版本时 fail closed。
- Codex Host Result v2 的 `verify-result` 结果验证、Prepare v5/Activation Plan v2/Host Result v2 的 7 条脱敏 Host Evidence 投影，以及通过生产 `NodeHookInputReaderAdapter`、`CodexHookAdapter` 与窄端口 doubles 运行的固定五 Case v2 Contract Suite；真实 Codex CLI `0.144.5` 已完成一次本机验收，但该记录不等于可发布版本矩阵。
- Codex Managed File：平台无关 InstallPlan Domain、隔离 Runtime Store 持久化、G0 Apply、Installation Revision、Existing Human File 保护、Manifest Claim Provenance、Windows 路径身份、原子文件/Manifest 写入和零 Repository 写入 dry-run E2E。
- RequirementWorkflow Aggregate/Reducer、Event Replay、File Store、版本冲突、幂等 Command 和 Human Pause/Resume/Cancel Gateway API。
- CodingTask 单仓 Aggregate/Reducer、独立 Schema、PlanRisk/G2 ExecutionAuthorization、Attempt 串行约束、Verification 结果接纳和 Human Resolution Domain API。
- CodingTask Worktree Inspector：真实 Worktree Root containment、分支、HEAD/Base Revision、Git 状态、Rename/Copy 解析、Write Set 越界检查和不泄露本机路径的稳定报告。
- Worktree Provision 未知状态恢复：从可信 Root 生成脱敏 Assessment，Human 绑定精确 Digest 后在 Repository/Action 双锁内闭合为 Recovered、RetryPermitted 或继续 WaitingHuman。
- Repository Lock：Workspace/Repository 作用域的排他文件锁、稳定 Lock Handle、幂等释放和脱敏 LockUnavailable 错误；该能力不授予 Worktree 创建或代码写入权限。
- 受控实现写入：只在权威授权、Write Set、Repository Lock、Action Journal 和内容摘要后置条件内执行显式文件变更。
- 实现提交：从可信 Repository Root 校验 Managed Worktree，以单一 Git Checkpoint 和 `ImplementationSubmitted` 把 Attempt 收口到 Verification；未知中间态由 Human 恢复。
- VerificationPlan/Check 严格校验、Verification Executor/Runner Port、串行验证用例、Required/Conditional/Advisory 状态聚合、输出 Digest 和不携带原始输出的 EvidenceBundle 装配；默认 Mock 未配置结果时 fail-closed 为 `Blocked`。
- 版本化 Verification Command：在 Repository Lock 与 Action Journal 内运行验证、持久化 EvidenceBundle 并接纳 CodingTask Verification 结果。
- Profile-backed Verification 影响面：由 G8 Check、权威 Changed Paths、Rule Target 和 Validator 映射生成单仓 Plan 与完整 Selection Trace。
- PRReadyArtifact 权威装配：只接受 Evidence Locator，从强一致 Store 读取 Passed Evidence，重算 Task-backed Human Gate，并绑定 Base/Head、Diff Digest、InputBindingSet、Verification、剩余风险和回滚方案。
- 生产 CodingTask Cell CLI：显式单仓 Runtime Binding、封闭 Verification Mode、启动期 Composition Root 映射和副作用前 fail-closed 一致性校验。
- Executor Compatibility CLI：从三份原始 Codex Host JSON 生成 Host/Contract 双 Artifact 与 12 条 Evidence，编译并内容寻址持久化 Policy/Matrix，按精确 Matrix Digest 跨进程重算查询。

当前 npm 包不提供：

- 自动需求澄清、Plan、Implementation、完整 Verification 和 Learning Workflow。
- 现有 CLI 写命令向 Command Gateway 的完整迁移、Child Workflow、完整 RequirementWorkflow Cell Runtime、Worktree 清理/重建和多仓 Verification 影响传播。
- G0 Rollback/Uninstall、CLI recovery、Codex Host Hook 自动安装、可签名 Codex 发布矩阵、其他工具/版本/平台验证、Claude-compatible 或 CatPaw Adapter。
- Agent 自主代码生成、多仓写入 Saga、PR、推送、合并、发布或部署。
- Skill、Connector、Wiki、Obsidian、Memory、Knowledge 或 Agent Registry Runtime。
- 完整项目 Validator Execution、真实命令输出存储/截断、Flaky/Waiver、Independent Verifier 和 ComplianceReport。

## 5. 依赖关系

```mermaid
flowchart LR
  core["Deterministic Core<br/>已实现"]
  rules["Rule Core<br/>已实现"]
  profile["Scanner + Profile Promotion<br/>已实现"]
  decision["Workflow 产品与技术方案<br/>已对齐"]
  workflow["Workflow Kernel<br/>部分实现"]
  executor["Executor + Hooks<br/>Codex Fixture 部分实现"]
  verify["Verification + Evidence<br/>部分基础"]
  projection["Instruction + Agent Projection<br/>未实现"]
  knowledge["Skills + Memory + Knowledge<br/>未实现"]

  core --> rules
  core --> profile
  rules --> profile
  profile --> decision
  decision --> workflow
  decision --> executor
  workflow --> verify
  executor --> verify
  rules --> projection
  profile --> projection
  workflow --> knowledge
  verify --> knowledge
```

该图表达 Workflow 评审后冻结的主要依赖。前置契约、Context Trust 和恢复语义先于真实 Executor；Tracker 依赖可重建 Query Projection，但不成为状态真源。

## 6. 文档阶段完成门

- `06-19` 每篇都有明确当前实现状态。
- 不再存在按四周或按月承诺交付的过时路线。
- 当前产品能力与目标能力在 README、SOP、路线图和专题文档中一致。
- Workflow Aggregate/Runtime 保持前置 Kernel 已实现；单一 CodingTask 编码 Cell 已可运行，完整 RequirementWorkflow Cell Runtime 仍未开工。固定 Cell/Failure 路由 Domain Policy、Event Replay、File Store、版本冲突和 Human 控制 API 已完成，Human/Lead 边界对齐继续有效。
- 所有 Markdown、链接、Prettier、文档索引和 Changeset 检查通过。

## 7. 下一实现门

Workflow 产品与技术方案已经对齐，持久化 Command Gateway、Revision/Context、Golden Replay、Timeline、Action Journal、JournaledActionRunner、Trace、Canonical Hook Core、Workflow Kernel 和 CodingTask Domain Core 已通过测试。Codex `apply_patch` Adapter、Binding、配置投影、CLI Wrapper、静态 Probe、G0 InstallPlan dry-run、G0 Apply、Installation Revision、Host Result v2 验证、Host 7 条 Evidence Projector、固定 v2 Contract Suite 5 条 ContractTest、写入前 Projection Set 复验、双 Artifact 内容寻址 Store 和重算查询 CLI 已完成实现；CodingTask Store/Command、显式可信单仓绑定的生产 CodingTask CLI Cell、Managed Worktree Provision/Inspector、未知 Provision Human 对账与下游 Guard、Repository Lock、受控文件变更、可信 Repository Root、Git Checkpoint、ImplementationSubmitted、Checkpoint 后权威绑定 Verification Target Revision、版本化 Verification Command/EvidenceBundle、G8 Profile-backed 单仓影响面、fail-closed Mock、显式 Local Command Runner 和单仓 PRReadyArtifact 已完成。真实 Git E2E 已通过生产 Bootstrap Local Command 映射、默认 Human Gate、PR-ready 装配与 dry-run 零 Repository 写入；固定公开项目 Smoke 已通过独立 Tarball Consumer 驱动 `unjs/defu@82632b66` 完成预编排单文件 Mutation 的 CLI 正路径、Passed Evidence、PRReadyArtifact、唯一 Commit 与跨进程幂等。

真实 Codex CLI `0.144.5`、Windows x64、Interactive TUI 的 12 条 Evidence 已全部 Passed，编译为本机 Compatible Matrix，并通过 Query 重算；Contract Failed Evidence 仍形成 Unsupported。确定性 Publication Bundle 已绑定双 Artifact、Evidence、Policy、Matrix、Tarball 与源码 Revision，并可由 create-only CLI 原子写出，但没有 G6 和受信签名时仍不能外推为可发布矩阵。当前没有 ProductionE2e、`modelId`、`permissionMode` 或 Tarball Attestation，绝不声明 Production。两类 Smoke 都不把自动化 Approval 计作日常业务 Human 决策，HTT 未测量，也不证明 Agent 自主编码或失败修复循环。下一步是 G6/Sigstore Attestation、Trusted Release Manifest 与安装选择门，再进入 Claude-compatible/CatPaw Adapter；Rollback/Uninstall、CLI recovery、Worktree 清理/重建、失败分类/受限重试和多仓编排仍属后续能力。
