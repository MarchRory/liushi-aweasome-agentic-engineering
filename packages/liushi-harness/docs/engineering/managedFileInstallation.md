# Managed File 安装协议

**状态：Codex `init --dry-run`、G0 Apply 和 Installation Revision 已实现；Rollback、Uninstall 和 CLI recovery 尚未实现。**

## 1. 目标

安装协议负责把平台无关的 Harness Profile 投影为执行器原生文件，并在任何写入前给 Human 一份可复核、可重放的 `InstallPlan`。协议必须满足：

- `--dry-run` 不修改 Repository 文件，只在 Runtime Store 保存不可变计划。
- Existing Human File 默认保持 External，不因内容相同而被静默接管。
- Harness 只更新 `managed-files.json` 中登记且现场 Digest 未漂移的文件。
- Apply 必须显式绑定计划 ID、计划 Digest、Workspace、Repository、`actor-id` 和 `idempotency-key`；这些字段共同固定 G0 Approval 的语义。
- `actor-id` 只是审计身份声明，不提供认证或授权；企业使用时必须由外部受信任包装器或身份系统注入。
- Apply、Rollback 和 Uninstall 都必须绑定 G0 Approval 与现场前置条件；当前仅 Apply 已提供 CLI 和执行闭环。
- Windows、macOS 和 Linux 差异由 Infrastructure 平台兼容层处理，Domain/Application 不判断操作系统。

## 2. 复用依据

- [chezmoi Architecture](https://www.chezmoi.io/developer-guide/architecture/) 将 Source、Target、Actual 和持久化 Entry State 分离，并通过持久化 SHA-256 检测第三方修改；本协议复用该状态划分，但不复用其 Dotfile 领域模型。
- [Kubernetes Server-Side Apply](https://kubernetes.io/docs/reference/using-api/server-side-apply/) 用显式 Manager Ownership 和 Conflict 防止协作者互相覆盖；本协议采用相同的“所有权冲突默认拒绝”原则，但首个版本不提供 `force-conflicts`。
- [`write-file-atomic`](https://github.com/npm/write-file-atomic) 已是包内依赖，继续负责同目录临时文件、`fsync` 和 Rename；Repository 级互斥、父目录耐久性和跨文件恢复仍由 Harness 自己编排。
- [Helm Rollback](https://helm.sh/docs/helm/helm_rollback/) 以已保存 Revision 为回滚输入；未来的 Rollback 设计同样只允许回滚到已持久化且 Digest 可验证的 Installation Revision，当前尚未提供该能力。

不直接引入 chezmoi、Kubernetes 或 Helm Runtime。它们的运行模型和 Harness 的 Repository、Gate、Artifact 边界不同，嵌入会扩大供应链和权限面。

## 3. 状态模型

```text
Desired State
  Adapter、Profile、Template、Source Digest、目标完整内容

Actual State
  Missing、Regular File、Unsupported Entry、现场 Content Digest

Persisted Managed State
  Owner、Profile、Package Version、上次 Applied Digest、创建前状态
  Repository、InstallPlan Digest、Installation Revision、Provenance

Desired + Actual + Persisted
  -> Create | Update | Conflict | Skip
  -> immutable InstallPlan
```

`managed-files.json` 是 Repository 内的托管清单投影，不是可信所有权证据；Runtime Store 中不可变的 InstallPlan 和 Installation Revision 才是权威执行与恢复输入。Repository 文件可以被 Human 伪造，因此仅通过 Schema 的声明固定标记为 `unverified_claim`，不能授权 Update、Skip、Rollback 或 Uninstall。只有 Runtime Store 中已 `Committed` 的 Installation Revision，才能通过逐字段校验把对应 Manifest 条目标记为 `verified_revision`。二者都不保存 Credential。

## 4. 首个实现切片

```powershell
liushi-harness init --target codex --root <absolute-path> --workspace <id> --repository <id> --dry-run
```

该命令执行真实只读检查，生成并持久化 `InstallPlan`：

- 当前只投影 `.codex/hooks.json`。
- 计划记录 Desired、Actual、Persisted Digest 和 Owner Metadata。
- 缺失目标生成 `Create`。
- 未登记 Existing File 生成 `Conflict`，即使内容恰好相同也不取得所有权。
- 未经 Runtime Installation Revision 证明的 Manifest 声明生成 `Conflict`，即使 Owner 和 Digest 都匹配也不取得所有权。
- Domain Policy 已定义经权威 Revision 验证后的 Drift、Update 和 Skip 决策，但当前切片不会把 Repository 自声明升级为已验证状态。
- 计划固定要求 `G0 Managed Files`；`--dry-run` 只创建计划，不执行 Apply。
- Runtime Store 与 Repository 相等、互为祖先/后代或经符号链接重叠时，在首个写入前拒绝。

`--dry-run` 允许写入 Runtime Store 的不可变审计计划，不得创建或修改 Repository 中的 `.codex/`、`.liushi-harness/` 或其他文件。CLI 输出必须明确区分 `repositoryMutated=false` 与 `planPersisted=true`。

## 5. G0 Apply 与恢复边界

### 5.1 G0 Apply

```powershell
liushi-harness init --apply <plan-ulid> --plan-digest <sha256> --workspace <id> --repository <id> --actor-id <id> --idempotency-key <key> [--store <path>] [--json]
```

`--apply` 是 G0 Human 明确动作。上述六个必填字段缺一不可；`--store` 选择 Runtime Store，`--json` 输出稳定 JSON Envelope。成功结果包含 `revisionId`、`disposition=applied|reused`、`status=committed` 和 `repositoryMutated`。

Apply 在 Repository Lock 内按以下顺序执行：

1. 读取并验证 Runtime Store 中不可变的 InstallPlan，精确匹配计划 ID、计划 Digest、Workspace 和 Repository。
2. 查找同一 Approval Revision；Approval 由 G0、计划 ID/Digest、Workspace/Repository、`actor-id` 和稳定 `idempotency-key` 共同限定。
3. 在任何 Repository 写入前重新读取 Manifest 和全部计划文件，执行全量 preflight，并采集 Create/Update 文件的完整 preimage。Existing Human File、Conflict、Digest 漂移、未知文件类型和符号链接均 fail closed。
4. 在任何 Repository 写入前，原子持久化包含计划、Approval、preimage、Apply 后 Manifest 投影和待创建目录的 Installation Revision Intent。
5. 对每个 Create/Update 文件执行原子写入，并立即持久化 `FileApplied` checkpoint；随后原子写入 Manifest，并持久化 `ManifestApplied` checkpoint。Skip 文件不写入。
6. 重新读取全部目标文件和 Manifest，验证后置条件，再依次持久化 `PostconditionsVerified` 与 `Committed`。

Installation Revision 的 `Committed` 状态是权威所有权证据；Repository Manifest 即使格式正确、Owner 和 Digest 看起来匹配，也不能替代 Runtime Store Revision。Apply 的路径安全、原子文件变更、目录耐久性和 Windows/POSIX 差异均属于 `platformCompatibility`/Infrastructure；Domain/Application 不混入操作系统判断。

### 5.2 多文件恢复

Repository 文件与 `managed-files.json` 无法依赖文件系统实现跨文件原子提交，因此 Apply 使用持久化阶段日志：

```text
Plan Approved
  -> Intent Persisted
  -> Target Files Applied
  -> Managed Manifest Applied
  -> Postconditions Verified
  -> Installation Revision Committed
```

进程在任一阶段中断后，已持久化 Intent 和现场 Digest 会被重放并关闭式分类。相同 Approval 已提交时直接返回 `Reused`，不读取或修改 Repository；如果文件和 Manifest 的物理现场已经全部达到 after 状态但 checkpoint 尚未补齐，只补齐缺失的元数据 checkpoint，并返回 `Reused` 与 `repositoryMutated=false`。只有没有任何写入事件且现场仍完全等于 before 状态的 Intent 才允许从头重启。

Partial、Mixed、Unknown、Digest 漂移或无法证明现场状态的 Revision 返回 `InstallationRecoveryRequired`，必须由 Human 介入；当前不会盲目重试，也不会自动回滚。Revision Store 的写入或锁释放结果无法判定时返回 `InstallationCommitOutcomeUnknown`，同样禁止自动重试。

### 5.3 Rollback 与 Uninstall 当前未实现

当前没有 Rollback、Uninstall 或 CLI recovery 命令。Installation Revision 中保存的 preimage、Manifest 投影和 checkpoint 只是恢复证据，不代表已经提供回滚或卸载行为；不得将它们当作可用命令或自动恢复能力。

## 6. 测试门禁

- Domain 表驱动测试覆盖 Create、Update、Conflict 和 Skip。
- Dry-run E2E 证明 Repository Tree 与 Git Status 不变。
- Existing Human File、Digest Drift、Symbolic Link 和 Manifest Corruption 全部 Fail Closed。
- Runtime Store 与 Repository 的直接、祖先、后代和符号链接重叠全部零写入拒绝。
- Windows managed-path 大小写别名不能建立两份所有权；POSIX 保持大小写敏感。
- Windows/POSIX 路径大小写与目录 `fsync` 降级由平台兼容层的宿主无关测试覆盖。
- Apply unit 测试覆盖锁、preflight/preimage、Intent、逐文件与 Manifest checkpoint、后置验证、幂等复用和 fail-closed 顺序。
- 文件变更与 Installation Revision Store integration 测试覆盖原子写、记录完整性、CAS checkpoint、ownership 验证、并发幂等和提交未知态。
- 完整 lifecycle integration 测试覆盖 dry-run、首次 Apply、跨进程复用和漂移拒绝；CLI E2E 覆盖显式 `init --apply`。
- POSIX mode 测试在 Windows 通过 `skipIf` 跳过；平台差异仍由 Infrastructure 测试覆盖。
- Codex、Claude-compatible 和 Generic Adapter 共享同一 Installation Domain Contract，只替换 Desired State Projector。
