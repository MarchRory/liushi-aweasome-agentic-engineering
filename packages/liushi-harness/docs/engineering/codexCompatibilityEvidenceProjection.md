# Codex Host 兼容性证据投影

## 1. 目标与边界

Codex Compatibility Evidence Projector 把已经完成受验的 Codex Host Packet 转换为可以交给 Executor Compatibility Matrix Domain 的脱敏 Host Artifact 和七条规范 Host Evidence。它属于 Infrastructure 层的来源投影器，不执行 TUI、不执行模型调用、不写入项目，也不自行计算 Matrix 支持等级。

**本文只说明 Host Projector 的 7 条 Evidence。** 公开 Application Compile 会在 Host Projection 成功后继续运行独立的 [Codex Contract Evidence 投影](./codexContractEvidenceProjection.md)，再接入 5 条 `contract_test`；Contract Suite、双 Artifact 和 12 条 Evidence 的合成不属于本文投影器的职责。

当前投影只服务于 `managed_file_mutation_hooks.v1`，并且只接受以下三个来源契约：

- Host Smoke Prepare Manifest v5：`liushi.codex-host-smoke.prepare.v5`。
- Host Smoke Activation Plan v2：`liushi.codex-host-smoke.activation-plan.v2`。
- Host Result v2：`liushi.codex-host-smoke.result-verification.v2`。

投影器实现不等于已经存在可发布版本矩阵。2026-07-16 已重新执行真实 Codex CLI `0.144.5` v2 Host，并生成本机 Host/Contract Artifact 与 `compatible` Matrix；历史 Host Smoke 结果仍属于旧版，测试 Fixture 和源码实现也不能代替真实 v2 来源。

## 2. 输入

投影器接受一个未信任边界输入：

| 输入                  | 内容                          | 用途                                                             |
| --------------------- | ----------------------------- | ---------------------------------------------------------------- |
| `prepareManifest`     | Prepare Manifest v5 原始 JSON | 提供项目包、静态 Probe、候选 Hook 配置、运行时环境和激活绑定摘要 |
| `activationPlan`      | Activation Plan v2 原始 JSON  | 提供交互式 TUI 会话绑定、固定启动参数和 Human 激活计划           |
| `hostResult`          | Host Result v2 原始 JSON      | 提供真实 Host 正负路径的受验结果、13 项检查和运行时环境摘要      |
| `artifactLocatorKind` | `ExecutorEvidenceLocatorKind` | 只选择 Repository、Runtime Store 或 External URI 存储边界        |

三个 JSON 可能包含本机绝对路径、项目路径以及激活所需的原始标识。它们只作为校验来源，不直接进入可发布 Artifact。调用方不能提交任意 Locator 字符串，只能通过 `artifactLocatorKind` 选择枚举类型；投影器在 Artifact Digest 产生后确定性生成 Locator：

| Locator Kind      | 确定性值                                                           |
| ----------------- | ------------------------------------------------------------------ |
| `repository_path` | `artifacts/executorCompatibility/codex/<64 字符十六进制摘要>.json` |
| `runtime_store`   | `executorCompatibility/codex/<64 字符十六进制摘要>.json`           |
| `external_uri`    | `urn:liushi:artifact:<完整 sha256 摘要>`                           |

因此 Locator 不能夹带 Workspace、Task、PlanRisk、Actor、Model、绝对路径、`..` 或 Secret；未知 Kind 关闭式失败。

当前不公开绕过 Application 的单独投影 CLI。公开的 `executor compatibility compile` 只接收三份原始 Host JSON；Host 投影成功后，Application 从 Host Projection 派生精确 `scope`、Host `artifactDigest` 和唯一动态 `observedAt`，运行固定 Contract Suite，再用两份独立 Artifact 的 12 条 Evidence 编译和持久化。`query` 要求受信 Matrix Digest，按 exact-schema allowlist 分别复验 Host 与 Contract Artifact、重投影全部 Evidence，并用源码固定 Policy 编译。Host Smoke 的准备、Human 激活和结果验证入口仍见 [Codex Host Smoke Prepare](./codexHostSmokePrepare.md) 与 [Codex Hook 生产接入 SOP](../22-codex-hook-production-sop.md)，Store 协议见 [Executor Compatibility Store 与 CLI](./executorCompatibilityStore.md)。

## 3. 关闭式校验链

投影器按以下顺序重新校验来源；任一环节失败都返回失败结果，不输出部分 Artifact 或部分 Evidence。

1. **契约版本与字段**：分别校验 Prepare v5、Activation Plan v2 和 Host Result v2 的投影字段。Host Result 必须是 `status=verified`、`hostEvidenceVerified=true`、`matrixSupportClaim=not_evaluated`，且 Host Surface 必须是 `interactive_tui`。
2. **原始摘要重算**：使用同一 RFC 8785 + SHA-256 摘要端口重算 Prepare Manifest、Activation Plan、Manifest 内静态 Probe、Manifest 内 Activation Binding 和 Host Result 摘要。
3. **摘要交叉绑定**：检查 Host Result 的 Prepare、Plan、Probe 和 Activation 摘要分别与来源重算值和 Manifest Binding 一致；Activation Plan 摘要还必须同时匹配 Manifest 的 `activationPlan.digest` 和 Binding 的 `activationPlanDigest`。
4. **完整 Packet 语义**：逐字段检查固定公开仓库 ID、URL、Revision、Package Manager、固定 Workspace、Worktree 拓扑与状态、Task、PlanRisk、npm Tarball、候选配置、Human 动作和未执行状态；Activation Plan 的 Trust、Hook Binding 参数、Host Session、完整正负 Prompt、场景字段、回滚路径和回滚说明也必须与同一 Manifest 精确一致。完整 Prepare Manifest 摘要和 Activation Binding 摘要继续提供不可分割的来源绑定。
5. **Probe 与版本绑定**：静态 Probe 必须是同一个 executable 按顺序执行 `--version`、`--help` 和 `features list`，Probe 状态必须为 `verified`。Codex 版本必须符合 Probe 的完整版本语法；Host 复验输出只能包含一个无歧义版本，并且必须与 Manifest 版本全等。命令参数、顺序、executable 和版本不能由投影器猜测或补全。
6. **Host 检查项与时序**：Host Result 的 `checks` 必须精确匹配固定的 13 项检查及其顺序，不能增删或重排；`verifiedAt` 不能早于 Prepare Manifest 的 `generatedAt`。
7. **来源路径语义**：路径解析由独立 Host OS 兼容层完成，不使用当前进程 OS 猜测来源路径。Windows 只接受完整盘符绝对路径或带非空 Server/Share 的普通 UNC 路径；根相对、驱动器相对、不完整 UNC、设备命名空间和 NUL 路径全部拒绝。
8. **运行时环境绑定**：`verify-result` 运行时实际读取 Node 的 `process.platform` 和 `process.arch`，只有二者分别与 Prepare Manifest 的 `executionEnvironment.platform` 和 `executionEnvironment.architecture` 精确一致时才通过。投影器再次校验 Host Result 的 `verificationEnvironment` 与同一 Manifest 环境一致。
9. **Domain 输入完整性**：从已校验来源生成 Scope、Artifact 和 Evidence 后，继续执行 Matrix Domain 的 Scope、Policy、Evidence Schema、确定性 Locator 和 Evidence Digest 校验。

这条链同时阻止跨项目、跨版本、跨 TUI Surface、跨运行环境和跨受验时序拼接证据。

## 4. Host Result v2 的语义

Host Result v2 是受验来源，不是 Matrix 结果。它返回以下结果信息：

- `hostEvidenceVerified=true`：表示本次精确 Host Scope 的结果门通过。
- `matrixSupportClaim=not_evaluated`：表示 Host Result 不自行评估或声明 Matrix 支持等级。
- `verifiedAt`：结果验证完成时间，只用于审计和时序校验。
- `prepareManifestDigest`、`activationPlanDigest`、`codexProbeDigest` 和 `activationDigest`：对来源和激活绑定的摘要引用。
- `verificationEnvironment`：本次 `verify-result` 实际采集的 Node platform/arch。
- `checks`：固定且有序的 13 项结果门检查。

Host Result v2 删除了 `productionVerified`。静态 Probe 的 `productionVerified=false` 仍然保留，因为它是另一个静态 Probe Schema 字段，表示静态探测不能自行形成生产保证；不能把这两个字段混为同一门槛。

## 5. 脱敏 Scope

投影器从三个来源建立一个精确且最小的 `ExecutorHostScope`：

| Scope 字段            | 来源                                                  | 投影规则                                      |
| --------------------- | ----------------------------------------------------- | --------------------------------------------- |
| `adapterKind`         | 固定值                                                | `codex`                                       |
| `distribution`        | 固定值                                                | `codex_cli`                                   |
| `adapterDigest`       | Prepare Manifest 的 `package.artifact.sha256`         | 作为 npm Tarball/Adapter 内容摘要             |
| `executorVersion`     | Prepare Manifest 的 `codexProbe.version`              | 只接受已验证的精确版本                        |
| `surface`             | Host Result 的 `hostScope`                            | 固定为 `interactive_tui`                      |
| `operatingSystem`     | Host Result 的 `verificationEnvironment.platform`     | 由 Node `win32`、`linux`、`darwin` 关闭式映射 |
| `architecture`        | Host Result 的 `verificationEnvironment.architecture` | 由 Node `x64`、`arm64` 关闭式映射             |
| `configurationDigest` | Prepare Manifest 的 `candidateHookConfig.digest`      | 绑定候选 Hook 配置投影                        |

当前精确 Scope 不包含 `modelId` 和 `permissionMode`。Activation Plan 的 Model 和 `--sandbox workspace-write` 只用于 Human 激活流程；投影器不从这些字段推断运行时 Model 或 Permission，也不把它们填入 Scope。未知 Node platform/arch 关闭式失败，不降级为模糊平台。

## 6. 脱敏 Host Artifact 与 Evidence

### 6.1 Artifact 内容

脱敏 Artifact 使用 `liushi.codex-compatibility-evidence.v1`，包含：

- 精确 Profile `managed_file_mutation_hooks.v1`。
- 上述最小 Scope。
- Prepare Manifest、Activation Plan、静态 Probe、Host Result 和 Activation 的内容摘要。
- 两条脱敏 Observation：`static_probe` 和 `host_smoke`，各自只保存审计时间、结果和参与结论的检查项。

Artifact 不保存 Manifest/Plan 的绝对路径，不保存原始 session、turn、tool call ID，不保存 Secret，也不复制模型对话或原始 Hook 输入。规范 Evidence 只引用由 Locator Kind 和 Artifact Digest 确定生成的内容寻址 Locator，不复制调用方字符串。

### 6.2 固定的 7 条 Host Evidence

同一条 `host_smoke` Observation 会按固定定义拆成多项规范 Evidence，但不会扩展来源没有证明的能力：

| 序号 | Capability             | Evidence Kind   | 参与检查项                                                                                      |
| ---: | ---------------------- | --------------- | ----------------------------------------------------------------------------------------------- |
|    1 | `command_hook_handler` | `static_probe`  | `codex_version`、`hook_framework_enabled`                                                       |
|    2 | `command_hook_handler` | `smoke_test`    | `trusted_hook_config`、`hook_binding`、`positive_same_tool_invocation`                          |
|    3 | `native_hook_input`    | `smoke_test`    | `positive_apply_patch_trace`、`positive_same_tool_invocation`                                   |
|    4 | `pre_file_mutation`    | `smoke_test`    | `positive_action_journal_closed`、`positive_same_tool_invocation`                               |
|    5 | `post_file_mutation`   | `smoke_test`    | `positive_action_journal_closed`、`positive_apply_patch_trace`、`positive_same_tool_invocation` |
|    6 | `pre_file_mutation`    | `negative_test` | `negative_authorization_denied`、`negative_exact_target_same_session`、`negative_no_post`       |
|    7 | `deny_file_mutation`   | `negative_test` | `negative_authorization_denied`、`negative_no_post`、`negative_target_unchanged`                |

Host Projector 绝不生成 `contract_test` 或 `production_e2e`。它也不把静态 Probe 的 `verified`、Host Result 的 `hostEvidenceVerified` 或历史结果门单独改写成 Production 声明。`contract_test` 只能由独立 Contract Artifact 投影，不能伪装成 Host Result 的一部分。

## 7. 支持等级边界

当前固定 Policy 是 `managed_file_mutation_hooks.v1`：

- 单独把本文 7 条 Host Evidence 交给 Compiler 时，缺少 ContractTest，最高只能得到 `experimental`。
- 公开 Application Compile 会接入独立 Contract Artifact 的 5 条 ContractTest；合成或通过投影契约校验的受验输入在 12 条 Evidence 全部 `passed` 时可编译为 `compatible`。
- Contract Check 正常完成但失败时会保留有效 Failed Evidence，完整集合形成 `unsupported`，不会伪装成 Host 投影失败或缺失。
- `production` 还需要每项能力的 `production_e2e`，并要求 Scope 绑定 Model、Permission 和 Configuration Digest。当前没有 ProductionE2e，Scope 也没有 `modelId` 或 `permissionMode`；Package Digest 不是 Tarball Attestation。
- Host Result 的 `matrixSupportClaim=not_evaluated` 不改变上述编译过程；最终等级只能由受信 Policy、完整 Evidence 集和 Matrix Compiler 决定。

因此，当前不能把 Host Projector 实现、测试 Fixture、旧版 Host Smoke 结果或单独的 Host Result v2 写成任意 Codex 版本的 `compatible` 或 `production` 声明。只有 2026-07-16 受验记录的 Codex CLI `0.144.5`、Windows x64、Interactive TUI 精确 Scope 可以声明本机 `compatible`；它仍不能形成可发布版本矩阵。

## 8. 失败条件

以下情况必须关闭式失败：

- 任一来源 Schema 版本、必填字段、状态或枚举值不匹配。
- 任一原始摘要、Activation Digest、Probe Digest 或来源交叉绑定漂移。
- Codex executable、version、Tarball digest、候选配置 digest 或 Host Session 不一致。
- 固定公开仓库 ID、URL、Revision、Package Manager、Workspace、Worktree 路径拓扑、Task、PlanRisk、Human 动作或未执行状态漂移。
- Activation Plan 的 Trust、Hook Binding 参数、固定推理强度、完整正负 Prompt、场景字段、回滚路径或回滚说明漂移。
- Windows 来源路径不是完整盘符绝对路径或普通完整 UNC，使用设备命名空间，或者任一来源路径含 NUL。
- Probe executable、命令参数、命令顺序、Probe 状态或版本值不符合固定约束。
- Host Result 缺少 `hostEvidenceVerified=true`、`matrixSupportClaim=not_evaluated`、完整环境、完整 13 项检查或合法时序。
- `verificationEnvironment` 与 Prepare Manifest 不一致，或 Node platform/arch 无法映射到受支持的 OS/Architecture。
- `artifactLocatorKind` 未知，或生成的 Scope、确定性 Locator、Artifact Schema、Evidence Digest 不能通过 Domain 校验。

失败时不能返回看似可用的部分证据，也不能用缺失字段、历史结果或模型自述补齐结论。

## 9. 当前状态与下一步

当前已完成 Host Result v2 运行时环境绑定、Host 7 条 Evidence Projector、固定 Contract Suite 5 条 ContractTest、双 Artifact 内容寻址 Store、重算查询 CLI、确定性 Publication Bundle、create-only 原子输出 CLI、P3a G6 Release Attestation Domain，以及一次真实 Codex CLI `0.144.5` 本机 Host/Matrix 验收。当前未完成的是 Sigstore Signing/Verification Adapter、签名 Artifact、Trusted Release Manifest 与安装信任门，不应把实现落地、合成 Fixture、本机可写 Store、未签名 Bundle 或 Draft 当成发布证据。

下一步按以下顺序推进：

1. 为已完成 G6/Identity/Candidate 绑定的 Draft 增加 Sigstore Signing/Verification Adapter 与显式 Trusted Root 离线验证。
2. 让 Trusted Release Manifest 与安装选择器只消费受信发布身份，不读取“最新”本机 Matrix。
3. 增加 ProductionE2E、模型与权限 Scope、Tarball Attestation 后再评估 Production Tier。
4. 在 Codex 发布边界闭合后，再分别为 Claude-compatible 和 CatPaw 建立独立 Adapter、Scope 和 Evidence。
