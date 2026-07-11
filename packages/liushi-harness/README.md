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
- Event、Snapshot、Hash、Schema 或 Lock 异常时 fail closed，不自动猜测或修复。
- ESM/CJS Library 入口，以及 `liushi-harness`、`lh` 两个 CLI Bin。

Agent Runtime、Hooks、Rule Scanner/Validator Execution、Instruction Projection、Memory、Skills、Connectors 和多仓写入编排仍属于后续实现范围，当前版本不声明这些能力可用于生产。

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
- [15 四周开发路线](./docs/15-four-week-roadmap.md)
- [16 Rules 与代码合规](./docs/16-rules-and-code-compliance.md)
- [17 Instruction Projection](./docs/17-instruction-projection.md)
- [18 Memory Runtime 与记忆治理](./docs/18-memory-runtime-and-curation.md)
- [19 Agent Registry 与平台配置生成](./docs/19-agent-registry-and-platform-rendering.md)

## CLI

正式 CLI 名称为 `liushi-harness`，提供短别名 `lh`。不注册过于通用的 `harness` 命令，避免与现有工具冲突。

```powershell
liushi-harness doctor --json
liushi-harness task create --workspace <workspace-id> --source <ticket-url> --json
liushi-harness task status --workspace <workspace-id> --task <task-ulid> --json
liushi-harness artifact propose --workspace <workspace-id> --task <task-ulid> --file .\requirement.json --json
liushi-harness approval decide --workspace <workspace-id> --task <task-ulid> --request <request-ulid> --request-digest <sha256:digest> --decision approved --idempotency-key <stable-key> --json
liushi-harness rules resolve --catalog .\ruleCatalog.json --context .\ruleContext.json --json
```

`rules resolve` 是报告型命令，不扫描或修改项目，也不激活 Candidate Rule。可执行 Bundle 返回 JSON `status=success` 和退出码 `0`；不可执行 Bundle 仍将完整诊断写入 stdout，但返回 JSON `status=blocked` 和退出码 `4`，从进程边界阻断后续流水线。

默认 Runtime Store 为 `~/.liushi-harness`。可以通过 `LIUSHI_HARNESS_HOME` 或单次命令的 `--store <path>` 覆盖。

## Development

```powershell
corepack pnpm@10.34.1 install --frozen-lockfile
corepack pnpm@10.34.1 --filter liushi-harness lint
corepack pnpm@10.34.1 --filter liushi-harness typecheck
corepack pnpm@10.34.1 --filter liushi-harness test
corepack pnpm@10.34.1 --filter liushi-harness build
```

源码按 `Domain -> Application -> Infrastructure/Presentation -> Bootstrap` 分层。每个业务模块与 Adapter 使用独立目录，内部职责拆分后仅通过模块根 `index.ts` 暴露公共 API；架构测试会拒绝越层依赖、循环依赖、深层导入、非法 I/O、非 lower camelCase 命名和缺失 TSDoc。

## Release History

用户可感知变化由 Changesets 维护在 [CHANGELOG.md](./CHANGELOG.md)。
