# npm Tarball 干净安装 Smoke

## 目标

`packageSmoke` 是发布前的确定性检查。它验证 npm 消费者实际收到并能够运行的发布物，而不是工作区源码、pnpm 链接或 `npm pack --dry-run` 的推断结果。

该检查会：

1. 在系统临时目录真实生成 `liushi-harness-<version>.tgz`。
2. 创建不属于 pnpm Workspace 的独立 consumer，并通过 npm 安装该 tarball 及其公开依赖。
3. 检查 ESM、CJS、类型声明、CLI 入口、README、CHANGELOG、LICENSE 和第三方声明。
4. 从安装结果导入 ESM 与 CJS Library，确认公开 Schema Export 可用。
5. 使用 npm 离线执行 `liushi-harness` 与 `lh` 两个 Bin 的 `help`，再执行带独立 Runtime Store 的 `doctor --json`。
6. 无论成功或失败都清理临时目录，不向仓库写入 tarball、lockfile 或 Runtime 状态。

## 执行

从仓库根目录运行：

```powershell
corepack pnpm@10.34.1 smoke:package
```

根命令先构建包，再执行 Package Smoke。若已经构建，也可以直接运行：

```powershell
corepack pnpm@10.34.1 --filter liushi-harness smoke:package
```

脚本默认从当前 Node.js 安装中解析 `npm-cli.js`，避免 Windows Shell 路径转义。非标准 Node.js 发行版可以通过 `NPM_CLI_JS_PATH` 显式提供 npm CLI 文件；该文件必须真实存在，否则检查失败。

## 门禁

GitHub Actions 的 Windows 与 Ubuntu Quality Matrix 在 Build 后执行同一 Package Smoke。正式 `release` 命令也必须在 `changeset publish` 前通过该检查；任何导入、Bin、Doctor、文件内容或 npm 安装失败都会阻止发布。

全量 Vitest 门禁固定使用单 Worker。真实 Git、文件 Lock 和临时目录测试在 Windows 并行执行时可能因资源竞争超过默认 5 秒并留下清理冲突；单 Worker 保持同一测试语义并消除该非确定性，不通过扩大超时掩盖失败。

该检查只证明发布物在干净 Consumer 中可安装和启动，不证明 CodingTask CLI 正路径或 Codex Host Hook 已在真实项目生效。固定公开项目的预编排 Mutation 正路径由 [固定公开项目 CodingTask Cell Smoke](./publicProjectSmoke.md) 独立验证；下一道门是在同一项目验证 Codex Host Hook 正负路径。Human Touch Time 只在存在真实 Human 计时区间时记录。
