# 固定公开项目 CodingTask Cell Smoke

## 目标

`publicProjectSmoke` 验证 npm 消费者实际安装的 `liushi-harness` 能否在工作区外的真实 TypeScript 项目完成固定预编排 Mutation 的 CodingTask CLI 正路径。它不使用源码直连、pnpm Workspace Link 或测试 Fixture 代替生产 CLI，但也不包含 Agent 需求理解、方案生成或自主编码。

固定目标为：

- Repository：`https://github.com/unjs/defu.git`
- Revision：`82632b66f5914e9946edce300e10633a3d5c0cb7`
- Package Manager：`pnpm@10.33.4`
- Write Set：`test/utils.test.ts`
- 需求：增加 module namespace object 的 `isPlainObject` 回归测试，不修改生产代码或历史业务逻辑

## 运行

```powershell
corepack pnpm@10.34.1 smoke:public-project
```

默认从 GitHub Clone。已有可信本地 Clone 时，可以只把它作为 Git Source；脚本仍会创建新的系统临时 Clone，并强制固定 Revision 和 `core.autocrlf=false`：

```powershell
$env:LIUSHI_PUBLIC_SMOKE_REPOSITORY = "C:\path\to\defu"
$env:LIUSHI_PUBLIC_SMOKE_EVIDENCE_FILE = ".\packages\liushi-harness\docs\evidence\publicProjectSmoke\defu-82632b66.json"
corepack pnpm@10.34.1 smoke:public-project
```

`LIUSHI_PUBLIC_SMOKE_KEEP=1` 仅用于失败排查，禁止脚本删除调用方提供的 Source Repository。默认只清理由脚本自身 `mkdtemp` 创建且通过前缀和父目录复核的根目录。

## 验证链路

1. 固定 Clone 执行 Frozen Install 和完整 Baseline Test。
2. 当前包执行真实 `npm pack`，独立 Consumer 从 Tarball 干净安装。
3. 安装后的 CLI 创建 Task，提出 RequirementContract 和 R2 PlanRisk，并记录 G1/G4 自动化模拟 Approval。
4. `cell run` 在显式 Runtime Binding 下创建受管 Worktree，只替换 Write Set 内的测试文件并形成唯一 Checkpoint。
5. Local Verification 在 Worktree 内离线安装依赖并运行完整 `pnpm test`。
6. 第二个独立 CLI 进程使用同一 Manifest 和 Store，必须返回深度一致的 Cell Report。
7. 脚本复核 `review_ready`、Passed Evidence、PRReadyArtifact、一个 Commit、唯一 Changed Path、精确文件内容和 Clean Worktree。

所有外部命令均通过 `spawnSync` 的非 Shell 模式运行。Windows 上的 npm、Corepack 和 pnpm 使用 Node 直接启动对应 JavaScript CLI，不依赖 `.cmd` 或命令字符串拼接。

## 证据边界

当前历史验证快照见 [defu-82632b66.json](../evidence/publicProjectSmoke/defu-82632b66.json)。快照通过 `package.artifact.sha256`、npm Integrity 和 Shasum 绑定实际安装运行的 Tarball，并记录生成时间、Node 版本、平台和架构；它不包含本机绝对路径、完整命令输出或环境变量值。`docs/evidence` 不进入 npm Tarball，避免证据快照反向改变被证明的发布物摘要。

`gateProtocol.mode=automated_simulation` 只证明 Gate 协议和 Artifact Digest 绑定有效，不代表真实 Human 已审批该需求。`metrics.humanTouchTime.status` 固定为 `not_measured`；Machine Duration 不能推断为 Human Touch Time。

该 Smoke 依赖公开 Git Source、包管理器缓存和真实项目工具链，因此不接入默认 CI 或 Release Gate。Tarball 的跨平台确定性安装仍由 [npm Tarball 干净安装 Smoke](./packageTarballSmoke.md) 负责。当前证据只关闭固定预编排 Mutation 的外部 CLI 正路径，不关闭真实 Human Gate、Agent 自主编码、失败分类与修复循环、Codex Host Hook 正负路径、企业项目安装或 Claude/CatPaw 兼容门。
