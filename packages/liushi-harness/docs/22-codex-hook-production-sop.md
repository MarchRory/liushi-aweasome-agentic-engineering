# 22 Codex Hook 生产接入 SOP

## 1. 适用范围

本 SOP 只覆盖 `liushi-harness` 当前已经实现的 Codex `apply_patch` PreToolUse/PostToolUse 接入。它不是完整的 Workflow Runtime，也不包含 Claude-compatible、CatPaw、自动安装器或 Agent Role Runtime。

当前 Hook 的职责是把一次文件编辑纳入 Canonical Action Hook Core，重新校验 Task、PlanRisk Write Set、风险等级、审批和 Action Journal。Hook 不能替代 CLI、Git、Sandbox、CI 或人工代码评审。

## 2. 接入前置条件

Human 在接入前必须确认：

- Task、Workspace、目标仓库 root 和当前 Revision 一致。
- PlanRisk Artifact 的类型、ID 和 Digest 精确匹配本次需求。
- PlanRisk 已通过不可豁免的 G4 Approval。
- 如果涉及历史业务逻辑、既有行为或兼容性变化，PlanRisk 已明确识别并通过 G2 Approval；不确定时按需要 Human 进一步确认处理。
- R4 操作不进入 Write Set，也不能通过 Hook 绑定绕过。
- 多仓或公共 infra 层分别确认每个仓库的 Read/Write Set，不把“全仓”误当成自动授权。

## 3. 生成并审阅配置

接入前先执行只读能力探测：

```powershell
liushi-harness hook probe --executor codex [--executable <path-or-command>] --json
```

Probe 通过 `shell=false` 对选定 executable 执行 `--version`、`--help` 和 `features list`，每条命令都有固定超时与输出上限，不启动模型、不读取凭据、不写入项目。报告会记录实际 executable 和每条参数；`hookFramework=verified` 只表示功能列表包含格式完整且启用的 `hooks` 行，不证明 PreToolUse、PostToolUse 或 Native stdin 已在 Host 中运行。具体能力只接受帮助文本中独立、非否定的显式声明。报告中的 `verified` 仅表示对应静态证据，`productionVerified` 当前固定为 `false`；找不到、Access Denied、超时、输出超限、非零退出、空输出或未知版本必须按未验证处理。

在目标仓库或公共层根目录执行：

```powershell
liushi-harness hook config --executor codex
```

该命令只向 stdout 输出确定性的 `hooks.json` 对象，不创建、覆盖或删除任何文件。Human 审阅输出后，才可以决定是否写入受信任项目的 `.codex/hooks.json`：

```powershell
liushi-harness hook config --executor codex > .codex/hooks.json
```

写入后需要确认：

- 配置只包含 `command` Handler，不包含未实现的 prompt、agent 或 async Handler。
- PreToolUse 和 PostToolUse 都只匹配 `apply_patch`。
- `command` 与 `commandWindows` 能在目标环境中找到 `liushi-harness`。
- Codex 已将该项目识别为受信任项目；写入配置后，Human 还必须通过 `/hooks` 审阅并信任当前 Hook 定义哈希。二者是独立 Gate。
- 绑定时使用的 Runtime Store 与 Hook 子进程使用同一个 `LIUSHI_HARNESS_HOME`。不要让 `hook bind` 写入一个自定义 Store，而让 Codex Hook 子进程回退到另一个默认 Store。

Codex 官方文档说明，当前 Hook 只运行 `command` Handler，且 PreToolUse 对部分工具的拦截能力有限；PostToolUse 不能撤销已经发生的副作用。因此这一步不能被解释为完整安全边界。[Codex Hooks 官方文档](https://learn.chatgpt.com/docs/hooks)

## 4. 绑定工作区

在 Human 已审阅 PlanRisk 后，针对每个仓库 root 或公共层 root 单独绑定：

```powershell
liushi-harness hook bind `
  --root <repository-root> `
  --workspace <workspace-id> `
  --task <task-ulid> `
  --artifact <plan-risk-artifact-ulid> `
  --artifact-digest <sha256:digest> `
  --actor-id <human-id>
```

绑定是幂等的：相同 root、Workspace、Task、Artifact 和 Digest 可以重复执行；不同身份尝试覆盖已有绑定会被拒绝。Hook 根据当前工作目录查找绑定，嵌套目录使用最长匹配的仓库或公共层 root。

多仓接入建议：

- 每个可写仓库分别绑定，不共享一个模糊的父目录绑定。
- 只读仓库或公共层也可以作为独立 root 绑定，但必须在 PlanRisk 中声明其实际写入范围。
- 一个需求涉及多个仓库时，使用同一个 Task 和对应的 PlanRisk 证据；仓库级授权仍然分别存在。
- 不要通过扩大 root 目录来规避 Write Set 校验。

## 5. 运行与验收

完成配置和绑定后，在临时验证仓或已审批的真实需求中执行一次最小闭环：

动态 Host 验收使用交互式 Codex TUI，不使用 `codex exec`。后者在不同版本和工具路径上存在 Hook 分发缺失，不能作为生产声明的统一证据。[openai/codex#18607](https://github.com/openai/codex/issues/18607)

1. 对 Write Set 内的 `apply_patch` 执行 PreToolUse，确认 Hook 退出码为 0 且 stdout 为空；`permissionDecision=allow` 只用于同时提供 `updatedInput` 的工具输入重写，不能用于原样放行。
2. 完成工具调用后执行 PostToolUse，确认 Action Journal 产生 Intent、Observation 和 Resolution 关联记录。
3. 对 Write Set 外的文件执行 PreToolUse，确认返回 `permissionDecision=deny`，并且没有写入目标文件。
4. 使用相同 `tool_use_id` 但修改工具输入，确认返回冲突而不是重放旧结果。
5. 让 Digest 不匹配或 Workspace 绑定不存在，确认 PreToolUse 返回结构化 `permissionDecision=deny`；让 stdin 无法解析或事件不可识别，确认进程以拒绝退出码结束。两种错误都不得被当成 Allow。
6. 检查 Task Timeline、Action Journal 和 Trace 是否能以 Task、Action 和因果标识关联，不把 Trace 当成业务状态真源。

维护者使用 `codexHostSmoke prepare` 生成受控公开项目 Fixture 时，必须在同一个已信任 Hook 定义的 TUI 中依次提交 Activation Plan 的正向和负向 Prompt。完成后运行：

```powershell
corepack pnpm@10.23.0 smoke:codex-host:verify-result -- `
  --manifest C:\path\to\control\prepareManifest.json `
  --activation-digest sha256:<digest>
```

`verify-result` 是只读、关闭式结果门。它同时校验精确 Hook 配置与 Binding、唯一正向 Git 差异、闭合 Action Journal、对应 Trace、负向授权拒绝和负向目标零写入；只有返回 `productionVerified=true` 才能声明该精确 TUI Host Scope 通过。

Hook 的原生入口是：

```powershell
liushi-harness hook handle --executor codex
```

它从 stdin 读取 Codex 原生 JSON，只向 stdout 输出平台原生 JSON，并兼容 Code Mode 可选提供的 `agent_id`、`agent_type`。已识别 PreToolUse 的处理失败或异常以退出码 0 返回结构化 `permissionDecision=deny`；已识别 PostToolUse 的失败返回结构化 `decision=block`，避免普通进程失败被宿主按 fail-open 继续处理。只有 stdin 无法解析或事件不可识别时，失败信息才写入 stderr 并使用拒绝退出码。该命令不接受 `--json`，避免把 CLI Envelope 误当成平台 Hook 响应。

## 6. 失败、暂停与回滚

- PreToolUse 被拒绝时，Human 先检查 PlanRisk、审批 Digest、目标路径和当前 Revision，不得直接修改 Hook 配置来绕过拒绝。
- PreToolUse 显示 `hook (failed)` 且工具仍被执行时，立即停止负向测试并视为 fail-open 故障；不得把非零退出码本身当作拦截成功证据。
- PostToolUse 失败或结果未知时，先由 Human 判断副作用是否已发生；只有证据明确为 `not_applied` 才能受控重试。
- 历史逻辑判断不清时暂停实现，回到产品和技术方案阶段确认业务语义，再更新 PlanRisk 和相应审批。
- 回滚接入时由 Human 移除项目 `.codex/hooks.json` 中的 Harness 配置，并审阅 Runtime Store 中的绑定记录；当前版本没有自动删除绑定或自动覆盖项目配置的命令。
- 任何修改受信任配置、删除绑定、扩大 Write Set 或切换 Store 的操作，都必须作为显式 Human 操作记录。

## 7. 当前支持声明

当前可以声明：

- Codex `apply_patch` PreToolUse/PostToolUse Adapter 已通过单元、架构和 Task/PlanRisk Fixture 集成测试。
- Binding、Digest、Write Set、G2/G4、R4、Action Journal 和 Trace 由 Harness Core 确定性校验。
- `hook config` 是只读配置投影，`hook handle` 是原生 stdin/stdout Wrapper。
- `hook probe` 是只读、版本化的静态能力报告，不把静态证据升级为生产支持。
- `verify-result` 将交互式 TUI 的正向、负向和 Harness 审计证据收敛为单一生产结果门。

当前不能声明：

- 已完成所有 Codex 工具的完整拦截或完整安全隔离。
- 未经 `verify-result` 的精确 Codex TUI、Claude-compatible、CatPaw、Codex Desktop/App Server 动态验证或自动安装。
- 已在所有企业多仓、公共层和受信任项目环境中完成端到端验证。
- Hook 已经替代 Human 审批、Git/CI 校验或业务代码评审。
