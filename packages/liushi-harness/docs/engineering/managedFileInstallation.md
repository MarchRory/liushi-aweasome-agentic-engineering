# Managed File 安装协议

**状态：首个 Codex `init --dry-run` 切片已实现；G0 Apply、Revision 验证、Rollback 和 Uninstall 尚未实现。**

## 1. 目标

安装协议负责把平台无关的 Harness Profile 投影为执行器原生文件，并在任何写入前给 Human 一份可复核、可重放的 `InstallPlan`。协议必须满足：

- `--dry-run` 不修改 Repository 文件，只在 Runtime Store 保存不可变计划。
- Existing Human File 默认保持 External，不因内容相同而被静默接管。
- Harness 只更新 `managed-files.json` 中登记且现场 Digest 未漂移的文件。
- Apply、Rollback 和 Uninstall 都绑定计划 ID、计划 Digest、G0 Actor 与现场前置条件。
- Windows、macOS 和 Linux 差异由 Infrastructure 平台兼容层处理，Domain/Application 不判断操作系统。

## 2. 复用依据

- [chezmoi Architecture](https://www.chezmoi.io/developer-guide/architecture/) 将 Source、Target、Actual 和持久化 Entry State 分离，并通过持久化 SHA-256 检测第三方修改；本协议复用该状态划分，但不复用其 Dotfile 领域模型。
- [Kubernetes Server-Side Apply](https://kubernetes.io/docs/reference/using-api/server-side-apply/) 用显式 Manager Ownership 和 Conflict 防止协作者互相覆盖；本协议采用相同的“所有权冲突默认拒绝”原则，但首个版本不提供 `force-conflicts`。
- [`write-file-atomic`](https://github.com/npm/write-file-atomic) 已是包内依赖，继续负责同目录临时文件、`fsync` 和 Rename；Repository 级互斥、父目录耐久性和跨文件恢复仍由 Harness 自己编排。
- [Helm Rollback](https://helm.sh/docs/helm/helm_rollback/) 以已保存 Revision 为回滚输入；本协议同样只允许回滚到已持久化且 Digest 可验证的 Installation Revision。

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

`managed-files.json` 是 Repository 内的托管所有权声明；Runtime Store 中的 InstallPlan 和后续 Installation Revision 才是权威执行与恢复输入。Repository 文件可以被 Human 伪造，因此仅通过 Schema 的声明固定标记为 `unverified_claim`，不能授权 Update、Skip、Rollback 或 Uninstall。二者都不保存 Credential。

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
- 计划固定要求 `G0 Managed Files`，但本切片不执行 Apply。
- Runtime Store 与 Repository 相等、互为祖先/后代或经符号链接重叠时，在首个写入前拒绝。

`--dry-run` 允许写入 Runtime Store 的不可变审计计划，不得创建或修改 Repository 中的 `.codex/`、`.liushi-harness/` 或其他文件。CLI 输出必须明确区分 `repositoryMutated=false` 与 `planPersisted=true`。

## 5. 后续执行切片

### 5.1 G0 Apply

```powershell
liushi-harness init --apply <install-plan-id> --actor-id <human-id>
```

Apply 必须先提交可验证的 Installation Revision，再由该 Revision 将 Manifest Claim 升级为 `verified_revision`；仅凭 Repository 文件不能证明所有权。随后重新读取全部 Actual State，并逐项匹配计划中的前置 Digest。Human 显式执行 `--apply` 时写入绑定计划 ID/Digest 的 G0 Approval；计划过期、未知文件类型、符号链接或任何 Conflict 都在首个副作用前关闭式失败。

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

进程在任一阶段中断后，Recovery 只按已持久化计划和现场 Digest 分类为 `Complete`、`RollbackPermitted` 或 `HumanRequired`，不盲目重试。

### 5.3 Rollback 与 Uninstall

- Rollback 只接受已提交 Installation Revision。
- Uninstall 只删除现场 Digest 仍等于最后 Applied Digest 的 Harness-owned 文件。
- Human 修改文件进入移交清单，不删除、不覆盖。
- Runtime Task、Evidence、Knowledge 和 Changelog 默认保留。
- `--purge-runtime` 使用独立计划、独立确认和绝对路径验证。

## 6. 测试门禁

- Domain 表驱动测试覆盖 Create、Update、Conflict 和 Skip。
- Dry-run E2E 证明 Repository Tree 与 Git Status 不变。
- Existing Human File、Digest Drift、Symbolic Link 和 Manifest Corruption 全部 Fail Closed。
- Runtime Store 与 Repository 的直接、祖先、后代和符号链接重叠全部零写入拒绝。
- Windows managed-path 大小写别名不能建立两份所有权；POSIX 保持大小写敏感。
- Windows/POSIX 路径大小写与目录 `fsync` 降级由平台兼容层的宿主无关测试覆盖。
- Apply 阶段加入每个持久化边界的故障注入、恢复重放和未管理文件零误删测试。
- Codex、Claude-compatible 和 Generic Adapter 共享同一 Installation Domain Contract，只替换 Desired State Projector。
