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
- 版本化 Application Command Envelope/Receipt 契约，包含因果标识、期望版本、幂等键和 `outcome_unknown`。
- Workflow S0 提供 EffectiveRevisionSet、InputBindingSet、ContextManifest、信任通道和失败分类的确定性校验。
- V1 Golden Replay Fixture 已冻结 Requirement 提交、审批、拒绝后新 Revision 和 Snapshot 重建语义。
- Event Log 写入或 `fsync` 失败返回独立的未知结果错误与退出码，禁止调用方自动重试。
- `getTaskTimeline` 通过独立只读 Port 从权威 Event Replay 生成版本化 Tracker DTO，不暴露 Store 路径、原始 Payload 或 Aggregate 内部结构。
- Action Journal 已提供严格 Intent、Observation、Resolution、独立 Action Lock、`actions.jsonl` Hash Chain、跨实例重放与恢复查询；只有明确 `not_applied` 才允许重试，`outcome_unknown` 必须等待 Human。
- Trace Observation 已提供版本化完成态 Span、W3C/OTel 标识、模型 Token/成本、Tool Call、因果关联、Best-effort 本地写入和 Tracker 查询；Trace 丢失或损坏不参与 Event Replay，也不改变业务结果。
- Application Command Gateway 已提供原子 Reservation、独立 Lock、跨进程幂等和稳定 Receipt；并发重复请求只执行一次 Handler，Pending 或 Receipt 提交失败固定返回 `outcome_unknown`。
- Canonical Action Hook Core 已提供严格 PreAction/PostAction 契约、Command/Payload 摘要绑定和 fail-closed Dispatcher；PreAction 只允许 PlanRisk Write Set 内的文件动作，R2/R3 必须绑定 G4 Human Approval，历史业务逻辑变更必须绑定 G2 Human Approval，R4 始终禁止。
- PostAction 会将结果确定性写入 Action Journal，并记录可丢失 Trace；失败或结果未知进入 Human 处理，只有证据证明 `not_applied` 才允许受控重试。
- Codex `apply_patch` Hook Adapter 已支持 PreToolUse/PostToolUse、确定性 Action ID、输入冲突检测、Workspace Binding 和 Action Journal/Trace 因果链。
- `hook config --executor codex` 可只读生成受审阅的 `hooks.json` 投影，`hook handle --executor codex` 提供 Codex 原生 stdin/stdout Wrapper；配置文件写入和项目受信任由 Human 控制。
- `hook probe --executor codex --json` 可只读探测 Codex 版本、帮助输出和静态 Hook 能力；找不到、Access Denied、超时或未知版本均不会被标记为生产支持。
- Workflow Domain 已冻结 RequirementWorkflow 的固定 Cell 顺序、Verification FailureTaxonomy 路由，以及 Human Pause/Resume/Cancel 控制策略；Aggregate、Store 和运行时 Command 仍未实现。

现有 CLI 写命令向 Application Command Gateway 的完整迁移、Codex 真实受信任项目安装与 Smoke、Claude-compatible/CatPaw 平台适配、实时 Span 生命周期与 OTel Exporter、Workflow Aggregate/Reducer、Agent Runtime、其他 Canonical 生命周期事件、Validator Execution、Instruction Projection、Memory、Skills、Connectors、多仓写入编排和 Profile 持久化 Registry 仍属于后续实现范围。当前 Profile Promotion 只生成可审计 Bundle，不写入业务仓库，也不代表代码已经通过合规验证。

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
liushi-harness hook config --executor codex > .codex/hooks.json
liushi-harness hook bind --root <repository-root> --workspace <workspace-id> --task <task-ulid> --artifact <plan-risk-artifact-ulid> --artifact-digest <sha256:digest> --actor-id <human-id>
liushi-harness hook probe --executor codex --json
```

`hook config` 只向 stdout 输出配置，不自动创建或覆盖 `.codex/hooks.json`；重定向、审阅和项目受信任必须由 Human 执行。`hook bind` 只接受精确的、已通过 G4 的 PlanRisk Digest，涉及历史业务逻辑时还必须通过 G2；R4 始终拒绝。`hook handle` 由 Codex Hook 通过 stdin 调用，输出平台原生 JSON，不使用 CLI JSON Envelope。

`hook probe` 只运行 `codex --version` 和 `codex --help`，输出能力报告，不启动模型、不读取凭据、不写入项目；它不能替代真实受信任项目的 Hook Smoke/Negative Test。

`rules resolve` 是报告型命令，不扫描或修改项目，也不激活 Candidate Rule。可执行 Bundle 返回 JSON `status=success` 和退出码 `0`；不可执行 Bundle 仍将完整诊断写入 stdout，但返回 JSON `status=blocked` 和退出码 `4`，从进程边界阻断后续流水线。

`project scan` 也是报告型命令。manifest 必须显式列出每个只读仓库的 `repositoryId`、`localRoot` 和 `repositoryRevision`，不接受预算字段。Scanner 全量遍历普通目录和文件并读取全部被分类的配置文件；规模本身不影响完整性。`localRoot` 仅用于本机 FileSystem Adapter，不进入报告和 digest。扫描完成且没有阻断诊断时返回 JSON `status=success` 和退出码 `0`；任何 `incomplete` 报告返回 JSON `status=blocked` 和退出码 `4`，后续必须 Human Review。即使扫描 `complete` 并返回退出码 `0`，`profilePromotionStatus` 仍为 `HumanReviewRequired`，不能视为已批准 Profile Promotion。超时和取消属于运行时编排问题，当前切片没有把它们建模为领域 Profile 状态。

`profile compile` 是 G8 后的确定性编译命令，不会自行扫描仓库。标准链路是：保存 `project scan --json` 的 `data` 为 Report，Human 基于该 Report 创建并提交 `ProjectProfileProposal`，批准返回的 G8 DecisionRequest，然后用同一 Report 和 Proposal Artifact ID 编译。Report、Proposal、Approval、Workspace、Task 或 Revision 任一漂移都会 fail closed；旧 Revision 的 Approval 不能复用。

默认 Runtime Store 为 `~/.liushi-harness`。可以通过 `LIUSHI_HARNESS_HOME` 或单次命令的 `--store <path>` 覆盖。

## Development

```powershell
corepack pnpm@10.34.1 install --frozen-lockfile
corepack pnpm@10.34.1 --filter liushi-harness lint
corepack pnpm@10.34.1 --filter liushi-harness typecheck
corepack pnpm@10.34.1 --filter liushi-harness typecheck:ts6
corepack pnpm@10.34.1 --filter liushi-harness test
corepack pnpm@10.34.1 --filter liushi-harness build
```

源码按 `Domain -> Application -> Infrastructure/Presentation -> Bootstrap` 分层。每个业务模块与 Adapter 使用独立目录，内部职责拆分后仅通过模块根 `index.ts` 暴露公共 API；架构测试会拒绝越层依赖、循环依赖、深层导入、非法 I/O、非 lower camelCase 命名和缺失 TSDoc。

## Release History

用户可感知变化由 Changesets 维护在 [CHANGELOG.md](./CHANGELOG.md)。
