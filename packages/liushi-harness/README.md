# liushi-harness

`liushi-harness` 是一个 CLI-first、Human-gated、可审计的 Agent Engineering Harness。它把需求澄清、技术方案、风险识别、开发、验证、知识沉淀和 Skill 改进组织成可恢复的项目工作流，同时适配 Codex 和 Claude-compatible 执行器。

本目录是 Awesome 仓库中的独立子包，计划以 npm 包发布。开放源代码只包含通用框架、Schema、模板和适配器，不包含企业代码、Wiki 内容、凭据或业务知识。

## Status

当前处于确定性核心实现阶段。第一个可运行纵向切片已经包含：

- `doctor` 对 Runtime Store 执行原子写入健康检查。
- `task create` 在排他 Lock 内提交首条 append-only Event 和原子 Snapshot。
- `task status` 从 Event Log 完整回放状态，并与 Snapshot 交叉校验。
- `artifact propose` 从受大小限制的 JSON 文件提交 Requirement、Business Logic 或 PlanRisk Artifact。
- `approval decide` 以 DecisionRequest ID、Digest 和幂等键记录不可变 Human 决策。
- G1、G2、G4 Gate 由 Core 确定性重算；R4 操作禁止提交，G1/G2/G4 不可豁免。
- Artifact、DecisionRequest 和 Approval 使用 RFC 8785 + SHA-256 内容摘要，并在每次重放时重新校验。
- `rules resolve` 从受大小限制的 Catalog/Context JSON 生成只读 `ApplicableRuleBundle`。
- Rule、Catalog 和 Bundle 使用严格 Schema 与 RFC 8785 Digest；Candidate、Stale、Superseded 和 Rejected Rule 不进入执行集合。
- Rule Resolver 支持多仓目标、Repository/Path/Task Scope、确定性 Glob、显式冲突、Revision Drift 与 Blocking Validator 可用性检查。
- `project scan` 读取显式 JSON manifest 中声明的一个或多个仓库 root，只生成 Project/Profile、Rule 和 Architecture Mechanism Candidate 报告，不写入项目、不执行配置。
- Project Scanner 不使用人工容量或读取预算；规模不会把完整扫描降级为不完整，但路径不可读、链接跳过、大小写冲突或配置解析失败仍会产生诊断。
- Project Scanner 对 JSON/JSONC 与 YAML 配置使用确定性解析；JS/CJS/MJS/TS 等可执行配置只记录存在和 digest，不 import、不 eval、不运行脚本。
- Project Scanner 输出不包含 manifest 中的 runtime-only `localRoot`，报告与 digest 只绑定 Repository ID、Revision、相对路径、诊断和 Candidate 字段。
- 重复 package owner 不会静默丢弃依赖边；Scanner 输出稳定排序的 `dependencyAmbiguities`，并将报告标记为 `incomplete`。
- `profilePromotionStatus` 固定为 `HumanReviewRequired`；扫描 `complete` 只允许 Human 创建 `ProjectProfileProposal`，不能直接激活 Candidate。
- `ProjectProfileProposal` 必须完整接受或拒绝每个仓库的 Rule/Mechanism Candidate，并由 G8 对精确 Artifact Digest 做不可豁免审批。
- `profile compile` 只接受最新且已获 G8 精确批准的 Proposal；它重新校验 Report、Candidate、Rule、Mechanism、Workspace、Task、Revision 和 Digest 后，确定性生成 ProjectProfile Bundle 与 Active ProjectRuleCatalog。
- Event、Snapshot、Hash、Schema 或 Lock 异常时 fail closed，不自动猜测或修复。
- ESM/CJS Library 入口，以及 `liushi-harness`、`lh` 两个 CLI Bin。
- 发布物门禁会真实生成 tarball，在 Workspace 外通过 npm 干净安装，并验证 ESM、CJS、两个 CLI Bin、Doctor、License 和必要发布文件。
- 版本化 Application Command Envelope/Receipt 契约，包含因果标识、期望版本、幂等键和 `outcome_unknown`。
- Workflow S0 提供 EffectiveRevisionSet、InputBindingSet、ContextManifest、信任通道和失败分类的确定性校验。
- V1 Golden Replay Fixture 已冻结 Requirement 提交、审批、拒绝后新 Revision 和 Snapshot 重建语义。
- Event Log 写入或 `fsync` 失败返回独立的未知结果错误与退出码，禁止调用方自动重试。
- `getTaskTimeline` 通过独立只读 Port 从权威 Event Replay 生成版本化 Tracker DTO，不暴露 Store 路径、原始 Payload 或 Aggregate 内部结构。
- Action Journal 已提供严格 Intent、Observation、Resolution、独立 Action Lock、`actions.jsonl` Hash Chain、跨实例重放与恢复查询；只有明确 `not_applied` 才允许重试，`outcome_unknown` 必须等待 Human。
- `JournaledActionRunner` 已提供 Action 级跨进程执行锁和 Intent-first 副作用协议：新 Intent 或 `retry_permitted` 才调用 Executor，已完成 Action 幂等复用，`intent_recorded` 不自动重放，已有 Observation 可以确定性补写 Resolution，执行后 Journal 无法闭合固定返回 `action_journal_commit_outcome_unknown`。
- Trace Observation 已提供版本化完成态 Span、W3C/OTel 标识、模型 Token/成本、Tool Call、因果关联、Best-effort 本地写入和 Tracker 查询；Trace 丢失或损坏不参与 Event Replay，也不改变业务结果。
- Application Command Gateway 已提供原子 Reservation、独立 Lock、跨进程幂等和稳定 Receipt；并发重复请求只执行一次 Handler，Pending 或 Receipt 提交失败固定返回 `outcome_unknown`。
- Canonical Action Hook Core 已提供严格 PreAction/PostAction 契约、Command/Payload 摘要绑定和 fail-closed Dispatcher；PreAction 只允许 PlanRisk Write Set 内的文件动作，R2/R3 必须绑定 G4 Human Approval，历史业务逻辑变更必须绑定 G2 Human Approval，R4 始终禁止。
- PostAction 会将结果确定性写入 Action Journal，并记录可丢失 Trace；失败或结果未知进入 Human 处理，只有证据证明 `not_applied` 才允许受控重试。
- Codex `apply_patch` Hook Adapter 已支持 PreToolUse/PostToolUse、Code Mode 子 Agent 字段、确定性 Action ID、输入冲突检测、Workspace Binding 和 Action Journal/Trace 因果链；Command Reservation 以摘要形式绑定 executor、session、turn、tool call、工具、目标与输入，不持久化原始宿主标识；Action、Command、Correlation 和 Trace/Span 标识从结构化 Workspace/Task invocation scope 摘要派生，不拼接宿主原始 ID；可识别事件的 Handler 失败或异常会映射为结构化 `deny`/`block`，不把普通进程失败误当作安全拒绝。
- `hook config --executor codex` 可只读生成受审阅的 `hooks.json` 投影，`hook handle --executor codex` 提供 Codex 原生 stdin/stdout Wrapper；配置文件写入和项目受信任由 Human 控制。
- `hook probe --executor codex --json` 可只读探测 Codex 版本、帮助输出与 `hooks` 功能开关，并通过 `--executable` 选择实际 Codex；找不到、Access Denied、超时、非零退出、空输出或未知版本均不会被标记为生产支持。
- `init --target codex --root <path> --workspace <id> --repository <id> --dry-run` 可生成并持久化 G0 InstallPlan；命令拒绝 Runtime Store 与 Repository 的直接或符号链接重叠，不写 `.codex/hooks.json` 或 Manifest，Existing Human File 和未经 Runtime Revision 证明的 Manifest Claim 均保持 `Conflict`。
- `init --apply` 已实现 G0 Human 明确 Apply：在 Repository Lock 内验证精确 InstallPlan 和同一 Approval，完成全量 preflight/preimage 后先持久化 Installation Revision Intent，再逐文件、Manifest 原子写入并记录 checkpoint，后置验证后提交 `Committed` Revision。
- Executor Compatibility Matrix Domain 已实现 Adapter/Distribution 分离、精确版本/Host/OS/模型/权限/配置 Scope、分级 Evidence、可复核 Locator、固定支持 Policy 与确定性 Digest 编译。Codex Host Projector 会关闭式校验 Prepare v5、Activation Plan v2 和 Host Result v2，并生成不含绝对路径及原始宿主标识的 7 条 Evidence；Application 再通过生产 `NodeHookInputReaderAdapter`、`CodexHookAdapter` 与窄端口 doubles 运行固定五 Case v2 Contract Suite，生成独立 Contract Artifact 与 5 条 ContractTest。Compile 与 Query 共用 exact-schema Projection Set Verifier，在任何持久化前校验父 Host Digest、精确 Scope 与统一观察锚点；Compile 只持久化复验返回值，并按 Host、Contract 顺序返回 `evidencePersistences`。真实维护者验收现已证明 Codex CLI `0.144.5`、Windows x64、Interactive TUI 的精确 Scope 可以编译为 `compatible`，且 Query 重算通过；该本机记录尚未形成受信发布矩阵。没有 ProductionE2e、`modelId`、`permissionMode` 和 Tarball Attestation 时绝不声明 Production。详见 [Codex Host v2 验证记录](./docs/engineering/codexHostValidationRecord.md)。
- `createExecutorCompatibilityPublicationBundle` 会按调用方提供的精确 `matrixDigest` 复用同一 Projection Set Verifier，重建当前受信 Policy、双 Artifact、12 条 Evidence 与 Matrix，并生成绑定 npm Tarball Digest、包版本、源码仓库和完整 Revision 的确定性 Bundle。Bundle 创建不写文件、不联网、不签名；没有 G6、Sigstore Attestation 和 Trusted Release Manifest 时不能驱动安装。
- Runtime Store 的 `Committed` Installation Revision 是所有权证据，Repository Manifest 自声明不可信；相同已提交 Approval 返回 `Reused`，物理现场已完成但 checkpoint 未闭合时只补齐元数据。Partial、Mixed、Unknown 和漂移状态必须 Human 介入，不盲目重试或自动回滚。
- Rollback、Uninstall 和 CLI recovery 当前未实现；`actor-id` 只是审计身份声明，不是认证机制，企业使用须由外部受信任包装器或身份系统注入。
- Workflow Domain 已冻结 RequirementWorkflow 的固定 Cell 顺序、Verification FailureTaxonomy 路由，以及 Human Pause/Resume/Cancel 控制策略；S2 Aggregate、Reducer、File Store 和 Gateway Command API 已实现，CLI Workflow 命令、Child 引用和运行时 Cell 仍未实现。
- CodingTask 已提供单仓 Aggregate、独立 Schema、File Store/Replay、Versioned Command Gateway/Service、权威 ExecutionAuthorization、G2 历史逻辑确认绑定、Attempt 串行状态机、Verification 结果接纳和 Human Resolution；Managed Worktree Provision Command 已通过 Repository Lock、JournaledActionRunner 和真实 `shell=false` Git Adapter 创建 Worktree。
- `implementationCommands` 已在权威授权、Write Set、Repository Lock 与 Action Journal 边界内提供受控文件变更；`implementationSubmissions` 使用可信 Repository Root 和原生 Git 创建单一 Checkpoint，以 `ImplementationSubmitted` 收口 Attempt，并对 Git/Event 非 ACID 中间态提供 Human 恢复入口。
- `verificationCommands` 已提供版本化 Verification 执行与 EvidenceBundle 接纳；VerificationPlan、显式 Local Command Runner 和强一致 EvidenceBundle Store 已落地，默认执行模式仍为 fail-closed Mock。
- `selectVerificationPlan` 已从 G8 Profile Check、CodingTask 最新实现 Revision/Changed Paths 和 Ready ApplicableRuleBundle 生成单仓确定性 Plan；调用方不能自报第二份 Revision、Path 或 Target ID。
- `assessWorktreeProvisionRecovery` 与 `worktreeProvisionRecoveryCommands` 已提供未知 Managed Worktree Provision 的只读现场评估和 Human 摘要确认；只在路径、Registry、分支与 Worktree 后置条件可证明时闭合为 `recovered` 或 `retry_permitted`，不执行清理、重建或自动重试。
- 未闭合 Worktree Provision Guard 已在同一 Repository Lock 内覆盖 Provision、受控文件变更、Implementation Submission 和 Verification；未知或等待 Human 的 Provision 会在新 Intent 与任何执行副作用前 fail closed，只有同一 `retry_permitted` Action 可以重试 Provision。
- `cell run` 已将 CodingTask 创建、Worktree Provision、Attempt、一个或多个受控文件变更、Checkpoint Submission、Verification 与单仓 `PRReadyArtifact` 装配串成可跨进程恢复的单一编码 Cell；生产 CLI 强制要求 Workspace、Repository、绝对 Repository Root 和 Verification Mode，并在任何副作用前精确校验 Manifest 绑定。只有权威 Store 中的 `passed` Evidence、当前 Human Gate 重算和来源 Artifact 绑定全部通过后才返回 `review_ready`。
- 固定公开项目 Smoke 已从真实 npm Tarball 独立安装启动生产 CLI，在 `unjs/defu@82632b66` 完成预编排单文件 Mutation 的 G1/G4 Gate 协议、受管 Worktree、单一 Checkpoint、离线安装、完整测试、Passed Evidence、PRReadyArtifact 与跨进程幂等复用。该结果不代表 Agent 已能自主理解需求或生成代码。
- Codex Host Result 已升级为 v2：删除 `productionVerified`，返回 `hostEvidenceVerified=true`、`matrixSupportClaim=not_evaluated`、`verifiedAt`、Prepare/Plan/Probe 摘要和 `verificationEnvironment`。`verify-result` 运行时实际读取 Node 的 platform/arch，并要求与 Prepare Manifest 精确一致后才通过；Host Result 只是受验来源，不自行声明 Matrix 支持等级。2026-07-16 的真实 v2 Host 已经通过结果门并编译出本机 `compatible` Matrix；历史旧版结果仍不能复用，本次本机记录也不能直接当作受信发布矩阵。

现有 CLI 写命令向 Application Command Gateway 的完整迁移、G0 Rollback/Uninstall、Publication Bundle CLI、G6/Sigstore Attestation、Trusted Release Manifest 与安装信任门、Claude-compatible/CatPaw 平台适配、实时 Span 生命周期与 OTel Exporter、完整 RequirementWorkflow Cell Runtime、Worktree 清理/重建、多仓写入编排、Import Graph 与多仓 Verification 影响传播、重试/Flaky、Waiver、Agent Runtime、其他 Canonical 生命周期事件、Validator Execution、Instruction Projection、Memory、Skills、Connectors 和 Profile 持久化 Registry 仍属于后续实现范围。当前 Profile Promotion 和 InstallPlan dry-run 都不写入业务配置，G0 Apply 也不代表代码已经通过合规验证。

本轮 S3 修订已补齐 CodingTask 的 append-only File Store、严格 Event Schema、Hash Chain、Locator 绑定、候选 Replay、Versioned Command Gateway、Command Service，以及从上游 Task Replay 重算 PlanRisk/G2/Write Set 的权威授权解析。CodingTask 的测试替身可以通过 Composition Root 注入，但默认路径不会信任调用方自报的 `allow`。

本轮仍未提供 Worktree 清理/重建、跨仓 Saga、Import Graph、多仓 Verification 影响传播、重试/Flaky、Waiver、完整 Workflow Runtime、Skills/Memory/Connectors 或 Studio；现有实现不会自主生成代码、创建 PR、推送、合并、发布或部署；Local Command Runner 必须显式启用，默认 Mock 未配置 Check 固定返回 `Blocked`。

## Documents

- [技术方案索引](./docs/README.md)
- [00 愿景与范围](./docs/00-vision-and-scope.md)
- [01 系统架构](./docs/01-system-architecture.md)
- [02 Artifact 契约](./docs/02-artifact-contracts.md)
- [03 任务状态机](./docs/03-task-state-machine.md)
- [04 Policy 与 Human Gates](./docs/04-policy-and-human-gates.md)
- [05 存储、锁与恢复](./docs/05-storage-lock-and-recovery.md)
- [06 代码库组织与工程约束](./docs/06-codebase-organization.md)
- [07 Workspace 与多仓组织](./docs/07-workspace-and-multi-repo.md)
- [08 执行器适配](./docs/08-executor-adapters.md)
- [09 Hooks 与 Agent Runtime](./docs/09-hooks-and-agent-runtime.md)
- [10 模型路由与评估](./docs/10-model-routing-and-evaluation.md)
- [11 Skills 与 Connectors](./docs/11-skills-and-connectors.md)
- [12 验证与 Evidence](./docs/12-verification-and-evidence.md)
- [13 学习与知识治理](./docs/13-learning-and-knowledge.md)
- [14 生产接入与长期使用 SOP](./docs/14-production-adoption-sop.md)
- [15 能力门驱动的交付路线](./docs/15-delivery-roadmap.md)
- [16 Rules 与代码合规](./docs/16-rules-and-code-compliance.md)
- [17 Instruction Projection](./docs/17-instruction-projection.md)
- [18 Memory Runtime 与记忆治理](./docs/18-memory-runtime-and-curation.md)
- [19 Agent Registry 与平台配置生成](./docs/19-agent-registry-and-platform-rendering.md)
- [20 文档与实现状态矩阵](./docs/20-implementation-status-matrix.md)
- [21 需求生命周期 Workflow 产品与技术方案](./docs/21-requirement-workflow-runtime.md)
- [22 Codex Hook 生产接入 SOP](./docs/22-codex-hook-production-sop.md)
- [Codex Host 兼容性证据投影](./docs/engineering/codexCompatibilityEvidenceProjection.md)
- [Codex Contract Evidence 投影](./docs/engineering/codexContractEvidenceProjection.md)
- [Executor Compatibility Store 与 CLI](./docs/engineering/executorCompatibilityStore.md)
- [Worktree Provision 未知状态恢复](./docs/engineering/worktreeProvisionRecovery.md)

## CLI

正式 CLI 名称为 `liushi-harness`，提供短别名 `lh`。不注册过于通用的 `harness` 命令，避免与现有工具冲突。

```powershell
liushi-harness doctor --json
liushi-harness task create --workspace <workspace-id> --source <ticket-url> --json
liushi-harness task status --workspace <workspace-id> --task <task-ulid> --json
liushi-harness artifact propose --workspace <workspace-id> --task <task-ulid> --file .\requirement.json --json
liushi-harness approval decide --workspace <workspace-id> --task <task-ulid> --request <request-ulid> --request-digest <sha256:digest> --decision approved --idempotency-key <stable-key> --json
liushi-harness rules resolve --catalog .\ruleCatalog.json --context .\ruleContext.json --json
liushi-harness project scan --file .\project-scan-manifest.json --json
liushi-harness profile compile --workspace <workspace-id> --task <task-ulid> --artifact <proposal-artifact-ulid> --report .\project-discovery-report.json --json
liushi-harness init --target codex --root <absolute-path> --workspace <workspace-id> --repository <repository-id> --dry-run [--store <path>] [--json]
liushi-harness init --apply <plan-ulid> --plan-digest <sha256> --workspace <id> --repository <id> --actor-id <id> --idempotency-key <key> [--store <path>] [--json]
liushi-harness cell run --file .\codingTaskCell.json --workspace <workspace-id> --repository <repository-id> --root <absolute-repository-root> --verification-mode <fail_closed_mock|local_command> --json
liushi-harness executor compatibility compile --executor codex --prepare <prepareManifest.json> --activation <activationPlan.json> --result <hostResult.json> [--store <path>] [--json]
liushi-harness executor compatibility query --matrix-digest <sha256> [--store <path>] [--json]
liushi-harness hook config --executor codex > .codex/hooks.json
liushi-harness hook bind --root <repository-root> --workspace <workspace-id> --task <task-ulid> --artifact <plan-risk-artifact-ulid> --artifact-digest <sha256:digest> --actor-id <human-id>
liushi-harness hook probe --executor codex [--executable <path-or-command>] --json
```

`hook config` 只向 stdout 输出配置，不自动创建或覆盖 `.codex/hooks.json`；重定向、审阅和项目受信任必须由 Human 执行。`hook bind` 只接受精确的、已通过 G4 的 PlanRisk Digest，涉及历史业务逻辑时还必须通过 G2；R4 始终拒绝。`hook handle` 由 Codex Hook 通过 stdin 调用，输出平台原生 JSON，不使用 CLI JSON Envelope。

`init --apply` 是 G0 Human 明确动作，必须同时提交精确的计划 ID/Digest、Workspace、Repository、`actor-id` 和 `idempotency-key`；成功 JSON 的 `data` 包含 `revisionId`、`disposition`、`status=committed` 和 `repositoryMutated`。`actor-id` 只用于审计身份声明，不提供认证或授权；企业接入必须由外部受信任包装器或身份系统注入。

`hook probe` 通过 `shell=false` 对选定 executable 运行 `--version`、`--help` 和 `features list`，每条命令都有固定超时与输出上限，并在报告中记录实际 executable 与参数。`hookFramework=verified` 只表示功能列表包含格式完整且启用的 `hooks` 行；PreToolUse、PostToolUse 和 Native stdin 仍只接受帮助文本中独立、非否定的显式声明。该命令不启动模型、不读取凭据、不写入项目，静态 Probe Schema 的 `productionVerified` 固定为 `false`；它是静态 Probe 的字段，不属于 Host Result v2，也不能替代真实受信任项目的 Hook Smoke/Negative Test。

`executor compatibility compile` 只接收三份原始 Host JSON；调用方不能提交 Contract Result 或任意 Passed Evidence。Application 先持久化独立 Host/Contract Projection，再发布 Matrix。成功 JSON 的 `data.evidencePersistences` 是按 Host、Contract 固定排序的二元组；旧字段 `evidencePersistence` 已移除。`query` 只按精确 `matrixDigest` 恢复两种 Artifact、重投影 12 条 Evidence 并重新编译，不选择“最新”记录。合成 Fixture 的 Compatible 结果不是实际 Host 验收或真实版本声明。

`rules resolve` 是报告型命令，不扫描或修改项目，也不激活 Candidate Rule。可执行 Bundle 返回 JSON `status=success` 和退出码 `0`；不可执行 Bundle 仍将完整诊断写入 stdout，但返回 JSON `status=blocked` 和退出码 `4`，从进程边界阻断后续流水线。

`project scan` 也是报告型命令。manifest 必须显式列出每个只读仓库的 `repositoryId`、`localRoot` 和 `repositoryRevision`，不接受预算字段。Scanner 全量遍历普通目录和文件并读取全部被分类的配置文件；规模本身不影响完整性。`localRoot` 仅用于本机 FileSystem Adapter，不进入报告和 digest。扫描完成且没有阻断诊断时返回 JSON `status=success` 和退出码 `0`；任何 `incomplete` 报告返回 JSON `status=blocked` 和退出码 `4`，后续必须 Human Review。即使扫描 `complete` 并返回退出码 `0`，`profilePromotionStatus` 仍为 `HumanReviewRequired`，不能视为已批准 Profile Promotion。超时和取消属于运行时编排问题，当前切片没有把它们建模为领域 Profile 状态。

`profile compile` 是 G8 后的确定性编译命令，不会自行扫描仓库。标准链路是：保存 `project scan --json` 的 `data` 为 Report，Human 基于该 Report 创建并提交 `ProjectProfileProposal`，批准返回的 G8 DecisionRequest，然后用同一 Report 和 Proposal Artifact ID 编译。Report、Proposal、Approval、Workspace、Task 或 Revision 任一漂移都会 fail closed；旧 Revision 的 Approval 不能复用。

`cell run` 的 `--workspace`、`--repository`、`--root` 和 `--verification-mode` 均为必填。生产 Bootstrap 只在显式传入 `local_command` 时启用本地命令；`fail_closed_mock` 不执行本地命令。Manifest 的 Create Workspace/Repository 以及 Provision、全部 Implementation、Submission Repository Root 必须与 CLI 绑定精确一致；Verification Worktree Root 必须等于从绑定 Repository Root 和受管 `worktreeBinding.relativePath` 推导的唯一规范路径。缺少绑定或任一不匹配都会在任何服务调用前 fail closed。Manifest 自报授权仍不能替代权威 Human Gate 重算。固定公开项目 Cell Smoke 只覆盖外部预编排 Mutation 的 CLI 正路径，不代表真实 Human 决策、Agent 自主编码或企业项目接入；Codex Host Result v2 仍需通过独立 `verify-result` 形成受验来源，不能直接视为 Matrix 支持声明。

默认 Runtime Store 为 `~/.liushi-harness`。它属于受信本地状态边界，目录及其祖先必须由运行 Harness 的 OS 主体独占，不能授予 Repository 代码或 Coding Agent 写权限。可以通过 `LIUSHI_HARNESS_HOME` 或单次命令的 `--store <path>` 覆盖，但覆盖路径同样必须满足该边界，不能放进不受信 Repository。

## Development

```powershell
corepack pnpm@10.34.1 install --frozen-lockfile
corepack pnpm@10.34.1 --filter liushi-harness lint
corepack pnpm@10.34.1 --filter liushi-harness typecheck
corepack pnpm@10.34.1 --filter liushi-harness typecheck:ts6
corepack pnpm@10.34.1 --filter liushi-harness test
corepack pnpm@10.34.1 --filter liushi-harness build
corepack pnpm@10.34.1 smoke:package
corepack pnpm@10.34.1 smoke:public-project
```

源码按 `Domain -> Application -> Infrastructure/Presentation -> Bootstrap` 分层。每个业务模块与 Adapter 使用独立目录，内部职责拆分后仅通过模块根 `index.ts` 暴露公共 API；架构测试会拒绝越层依赖、循环依赖、深层导入、非法 I/O、非 lower camelCase 命名和缺失 TSDoc。

## Release History

可信根解析、Git Checkpoint 与 Attempt 收口边界见 [实现 Checkpoint 提交](./docs/engineering/implementationCheckpointSubmission.md)。

依赖复用、核心自持语义与候选组件边界见 [Build vs Reuse 决策](./docs/engineering/buildVsReuse.md)。

版本化验证命令的运行边界与恢复限制见 [版本化验证命令](./docs/engineering/versionedVerificationCommand.md)。

G8 Check、权威 Revision/Changed Paths 与 Rule Target 驱动的计划选择见 [Verification 影响面选择](./docs/engineering/verificationImpactSelection.md)。

Agent 文件写入的 Write Set、内容摘要与恢复边界见 [受控文件写入](./docs/engineering/controlledFileMutation.md)。

用户可感知变化由 Changesets 维护在 [CHANGELOG.md](./CHANGELOG.md)。

发布物验证边界与 CI/Release Gate 见 [npm Tarball 干净安装 Smoke](./docs/engineering/packageTarballSmoke.md)。

固定公开项目的 CLI 正路径、证据字段与 HTT 边界见 [固定公开项目 CodingTask Cell Smoke](./docs/engineering/publicProjectSmoke.md)。

真实 Codex Host 验收的只读准备和关闭式结果门见 [Codex Host Smoke Prepare](./docs/engineering/codexHostSmokePrepare.md) 与 [Codex Hook 生产接入 SOP](./docs/22-codex-hook-production-sop.md)；Host 来源到 7 条脱敏 Evidence 的校验链见 [Codex Host 兼容性证据投影](./docs/engineering/codexCompatibilityEvidenceProjection.md)，固定五 Case、Failed Evidence 与独立 Contract Artifact 见 [Codex Contract Evidence 投影](./docs/engineering/codexContractEvidenceProjection.md)，双 Artifact 持久化与重算查询协议见 [Executor Compatibility Store 与 CLI](./docs/engineering/executorCompatibilityStore.md)。

Managed File 的所有权、零写入 dry-run、G0 和后续恢复边界见 [Managed File 安装协议](./docs/engineering/managedFileInstallation.md)。

跨 Codex、Claude Code 与 CatPaw 的精确 Scope、Evidence 和支持声明算法见 [执行器兼容性矩阵](./docs/engineering/executorCompatibilityMatrix.md)。
