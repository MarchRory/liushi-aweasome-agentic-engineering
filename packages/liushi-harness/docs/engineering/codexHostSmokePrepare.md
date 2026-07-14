# Codex Host Smoke Prepare

## 目标

`codexHostSmoke prepare` 为固定公开项目的真实 Codex Host Hook 正负路径验收准备可审计 Fixture。它复用 `publicProjectSmoke` 的 `unjs/defu@82632b66`、npm Tarball Consumer、Baseline 和 Gate 协议，但不会运行 CodingTask Cell 的预编排 Mutation。

Prepare 是真实 Host Smoke 的前置阶段，不是 Host Smoke 通过证据。它固定保持以下边界：

- 不启动 Codex 交互式 TUI，不产生模型调用或 Token 成本。
- 不修改 `$CODEX_HOME/config.toml` 或任何项目 trust 配置。
- 不执行 `hook bind`。
- 不写入 Worktree 的 `.codex/hooks.json`。
- 不修改目标项目文件。

## 运行

该命令是源码仓库的维护者验证工具，不是 npm 包的公开命令。Human 必须在仓库根目录显式提供尚不存在的绝对根目录和已存在的 Codex 可执行文件：

```powershell
corepack pnpm@10.23.0 smoke:codex-host:prepare -- `
  --root D:\liushi-smoke\defu-codex-host `
  --codex C:\path\to\codex.exe `
  --codex-home D:\.codex `
  --model gpt-5.6-sol `
  --actor-id smoke-human
```

`--root` 已存在、不是绝对路径或包含 NUL 时，命令关闭式拒绝。Prepare 失败后，只会清理本次成功创建且经 `lstat` 证明为普通目录的精确 root；调用方原有目录不会被删除。Prepare 成功后保留该目录，等待 Human 审阅和激活。

`--model` 必须由 Human 显式选择并进入 Activation Digest。上例使用当前旗舰 `gpt-5.6-sol`；Host Smoke 的任务很窄，Activation Plan 固定使用 `low` reasoning effort 控制成本。[OpenAI Model guidance](https://developers.openai.com/api/docs/guides/latest-model)

Human 批准前必须使用 Manifest 中的精确 Digest 执行只读复核：

```powershell
corepack pnpm@10.23.0 smoke:codex-host:verify -- `
  --manifest C:\path\to\control\prepareManifest.json `
  --activation-digest sha256:<digest>
```

`verify` 不写文件、不执行模型；它会关闭式校验 Manifest、Activation Plan、候选 Hook 配置、Codex 版本、Worktree 状态，以及 Hook 配置、Binding 和 Host 证据仍未出现。

## 准备链路

1. 固定 Clone `unjs/defu` 并运行 Frozen Install 与完整 Baseline Test。
2. 从当前包执行真实 `npm pack`，由独立 Consumer 安装 Tarball。
3. 通过本地普通 Clone 创建固定 Revision、Detached 且 Clean 的独立 Working Tree，并要求 `.git` 为真实目录。Codex 当前会静默忽略 linked worktree 根目录中的项目 Hooks，因此 Prepare 禁止使用 `.git` 文件形态。[openai/codex#27133](https://github.com/openai/codex/issues/27133)
4. 通过安装后的 CLI 建立 G1/G4 自动化模拟 Gate 协议，但不执行 Hook Binding。
5. 通过安装后的 CLI 对指定 Codex 执行静态 `hook probe`；要求报告 Schema v2、三条命令、`overallStatus=verified`、`hookFramework=verified` 和 `productionVerified=false`。
6. 通过安装后的 CLI 获取原生 Hook Projection，将 Handler 绑定到实际 Node、Tarball CLI Entrypoint 和 Worktree 内的 `.liushi-harness-runtime`。Prepare 将该目录精确加入临时普通 Clone 的 `.git/info/exclude`，使 `workspace-write` 可以写审计状态且不污染业务 Git 差异；不得把 Runtime 放到 Worktree 外或受 Sandbox 保护的 `.codex` 内。
7. 只将候选配置写入 `control/candidateHooks.json`，并生成 `control/prepareManifest.json`。
8. 生成 `control/activationPlan.json`，固定 trust 片段、Hook 写入、Binding、交互式 TUI 启动参数、正负场景 Prompt 和回滚边界，但不执行其中任何动作。

所有外部命令继续使用 `shell=false`。候选 Hook 命令只是待审阅配置字符串，Prepare 不执行该字符串。

## Code Mode 兼容

当前旗舰模型可能以 `code_mode_only` 方式暴露工具。Host Smoke 因此要求模型只调用一次 `functions.exec`，并在该编排内部只调用一次 `tools.apply_patch`；Hook matcher 仍使用 Codex 官方支持的 `^apply_patch$`。不得将提示退化为要求模型直接调用顶层 `apply_patch`，否则模型可能在没有真实工具调用时仅输出完成声明。

`codex exec` 不能承载本次动态验收。Codex 官方问题记录了非交互模式不分发 PreToolUse/PostToolUse 的路径，而本机正向执行也出现了“文件已改但 Hook 零证据”的结果。[openai/codex#18607](https://github.com/openai/codex/issues/18607)

Activation Plan 因此只生成 `interactive_tui` 会话和两条独立场景 Prompt。Human 必须在同一个已通过 `/hooks` 信任审阅的 TUI 中依次执行正向、负向场景；不得把 Codex Desktop、App Server 或 `codex exec` 的结果自动等同于该 Host Scope。

场景完成后运行只读结果验证：

```powershell
corepack pnpm@10.23.0 smoke:codex-host:verify-result -- `
  --manifest C:\path\to\control\prepareManifest.json `
  --activation-digest sha256:<digest>
```

只有该命令返回 `productionVerified=true` 才表示精确 TUI、Codex 版本、项目和 Activation Digest 通过。验证器要求正向目标只有一行差异、Action Journal 完整闭合、Trace 绑定 `apply_patch`，同时要求负向目标零写入并存在 `authorization_denied` Command Receipt；模型自述、UI Active、退出码和单独文件差异均不是充分证据。

## 激活摘要

Manifest Schema 为 `liushi.codex-host-smoke.prepare.v5`，状态固定为 `human_activation_required`。`activation.digest` 绑定：

- 固定仓库身份、Revision、Working Tree HEAD 和 `.git=directory` 发现约束。
- 实际 Codex executable 与版本。
- npm Tarball SHA-256。
- 候选 Hook 配置 Digest。
- Workspace、Task 和 PlanRisk Artifact ID/Digest。
- 完整 Human Activation Action 列表。
- 精确 Activation Plan Digest。

任何风险相关字段漂移都会改变 Activation Digest。Manifest 是包含本机路径的本地控制文件，不能作为可发布的跨机器 Evidence。

## Human Gate

后续真实执行前，Human 必须分别完成：

1. 审阅候选 Hook 配置和 Activation Digest。
2. 将 Manifest 中的精确 Worktree Root 加入 Codex trusted project 配置。
3. 明确批准 Hook Binding、`.codex/hooks.json` 写入和仅限该临时 Worktree 的 `workspace-write` Host Smoke。
4. 写入配置后，在 Codex `/hooks` 中审阅并信任当前 Hook 定义哈希；项目 trust 不能替代该步骤。
5. 在同一个 TUI 中按 Activation Plan 顺序执行两个场景，并运行 `verify-result` 收口证据。

在上述动作完成并记录前，不得增加自动 trust、`--dangerously-bypass-hook-trust`、`danger-full-access` 或隐式执行路径。
