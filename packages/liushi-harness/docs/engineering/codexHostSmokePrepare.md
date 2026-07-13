# Codex Host Smoke Prepare

## 目标

`codexHostSmoke prepare` 为固定公开项目的真实 Codex Host Hook 正负路径验收准备可审计 Fixture。它复用 `publicProjectSmoke` 的 `unjs/defu@82632b66`、npm Tarball Consumer、Baseline 和 Gate 协议，但不会运行 CodingTask Cell 的预编排 Mutation。

Prepare 是真实 Host Smoke 的前置阶段，不是 Host Smoke 通过证据。它固定保持以下边界：

- 不运行 `codex exec`，不产生模型调用或 Token 成本。
- 不修改 `$CODEX_HOME/config.toml` 或任何项目 trust 配置。
- 不执行 `hook bind`。
- 不写入 Worktree 的 `.codex/hooks.json`。
- 不修改目标项目文件。

## 运行

该命令是源码仓库的维护者验证工具，不是 npm 包的公开命令。Human 必须在仓库根目录显式提供尚不存在的绝对根目录和已存在的 Codex 可执行文件：

```powershell
corepack pnpm@10.23.0 smoke:codex-host:prepare -- `
  --root D:\liushi-smoke\defu-codex-host `
  --codex C:\path\to\codex.exe
```

`--root` 已存在、不是绝对路径或包含 NUL 时，命令关闭式拒绝。Prepare 失败后，只会清理本次成功创建且经 `lstat` 证明为普通目录的精确 root；调用方原有目录不会被删除。Prepare 成功后保留该目录，等待 Human 审阅和激活。

## 准备链路

1. 固定 Clone `unjs/defu` 并运行 Frozen Install 与完整 Baseline Test。
2. 从当前包执行真实 `npm pack`，由独立 Consumer 安装 Tarball。
3. 创建固定 Revision、Detached 且 Clean 的独立 Git Worktree。
4. 通过安装后的 CLI 建立 G1/G4 自动化模拟 Gate 协议，但不执行 Hook Binding。
5. 通过安装后的 CLI 对指定 Codex 执行静态 `hook probe`；要求报告 Schema v2、三条命令、`overallStatus=verified`、`hookFramework=verified` 和 `productionVerified=false`。
6. 通过安装后的 CLI 获取原生 Hook Projection，将 Handler 绑定到实际 Node、Tarball CLI Entrypoint 和独立 Runtime Store。
7. 只将候选配置写入 `control/candidateHooks.json`，并生成 `control/prepareManifest.json`。

所有外部命令继续使用 `shell=false`。候选 Hook 命令只是待审阅配置字符串，Prepare 不执行该字符串。

## 激活摘要

Manifest Schema 为 `liushi.codex-host-smoke.prepare.v1`，状态固定为 `human_activation_required`。`activation.digest` 绑定：

- 固定仓库身份、Revision 和 Worktree HEAD。
- 实际 Codex executable 与版本。
- npm Tarball SHA-256。
- 候选 Hook 配置 Digest。
- Workspace、Task 和 PlanRisk Artifact ID/Digest。

任何风险相关字段漂移都会改变 Activation Digest。Manifest 是包含本机路径的本地控制文件，不能作为可发布的跨机器 Evidence。

## Human Gate

后续真实执行前，Human 必须分别完成：

1. 审阅候选 Hook 配置和 Activation Digest。
2. 将 Manifest 中的精确 Worktree Root 加入 Codex trusted project 配置。
3. 明确批准 Hook Binding、`.codex/hooks.json` 写入和仅限该临时 Worktree 的 `workspace-write` Host Smoke。

在上述动作完成并记录前，不得增加自动 trust、`--dangerously-bypass-hook-trust`、`danger-full-access` 或隐式执行路径。
