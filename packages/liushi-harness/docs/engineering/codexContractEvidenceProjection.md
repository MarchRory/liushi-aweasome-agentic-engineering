# Codex Contract Evidence 投影

**状态：已实现。固定 Suite 通过生产 `CodexHookAdapter` 运行，输出独立、脱敏、内容寻址的 Contract Artifact 与五条 `contract_test` Evidence；它不是 Host 验收、Tarball Attestation 或 Production 声明。**

## 1. 目标与边界

Codex Contract Evidence Projector 证明 `liushi-harness` 的生产 `CodexHookAdapter` 是否满足 `managed_file_mutation_hooks.v1` 所需的五项规范能力。它只运行固定、确定性的 Adapter Contract，不启动 Codex TUI、不调用模型、不读写真实项目，也不自行信任调用方提交的 Scope 或时间。

本投影位于 Host Projector 之后：Host Projector 先从 Prepare Manifest v5、Activation Plan v2 和 Host Result v2 生成七条 Host Evidence；Application 再把其中已收敛的精确 Scope、Host Artifact Digest 与唯一动态观察时间交给 Contract Projector。Host 的七条 Evidence 仍由 [Codex Host 兼容性证据投影](./codexCompatibilityEvidenceProjection.md) 单独说明。

Contract Suite 的实现和测试 Fixture 只证明确定性契约行为。窄端口 doubles 不是“真实 Host 结果”，仓库内 Fixture 也不是某个 Codex 版本的真实 Host 验收。

## 2. 四项受信输入

`ProjectCodexContractEvidenceInput` 只接受四项由 Application 组装的输入：

| 输入                  | 来源与约束                                                                                     |
| --------------------- | ---------------------------------------------------------------------------------------------- |
| `scope`               | Host Projection 的唯一精确 `ExecutorHostScope`；必须是 `codex`、`codex_cli`、`interactive_tui` |
| `hostArtifactDigest`  | Host Artifact 的 RFC 8785 SHA-256 内容摘要，用于父 Artifact 绑定                               |
| `observationAnchor`   | Host 六条动态 Smoke/Negative Evidence 共有的唯一 `observedAt`                                  |
| `artifactLocatorKind` | 只选择 Repository、Runtime Store 或 External URI 的内容寻址边界                                |

输入 Schema 关闭式拒绝未知字段、非法摘要、非法时间或未知 Locator Kind。Scope 还必须包含 `configurationDigest`，且不得包含 `modelId` 或 `permissionMode`；Contract Projector 不从 Activation Plan 或固定测试数据补齐这两个字段。

`hostArtifactDigest` 只把 Contract Artifact 绑定到同一次 Host Projection。Host Scope 中的 `adapterDigest` 虽来自受验 Package Artifact 摘要，但当前链路没有 Tarball Attestation；Contract Projector 也不执行 Tarball 证明。

## 3. 生产 Adapter 与窄端口 doubles

Suite 固定要求构造函数精确等于生产 `CodexHookAdapter`。每个 Case 都通过该 Adapter 接收 Codex 原生 PreToolUse/PostToolUse 输入，再观察 Adapter 交给 Canonical 层的 Command、Payload 和原生响应映射。

为了让 Contract 可重复运行，`CodexContractRuntimeHarness` 只在以下窄端口提供确定性 doubles：

- Canonical Hook Dispatcher。
- Hook Workspace Binding Reader。
- Task Reader。
- Action Journal Reader。
- Observation Clock。

这些 doubles 只提供 Case 所需的最小状态并捕获规范输出，不替代 `CodexHookAdapter`，也不伪造 Host Smoke、Codex 进程、模型调用或生产验收结果。每个 Case 使用隔离状态；固定目标、固定绑定和固定响应只属于 Contract 输入。

## 4. 固定 Suite、Case 与 Check

Suite 标识为 `managed_file_mutation_hooks.codex.contract.v1`，定义版本为 `1.0.0`。Suite、五个 Case 和每个 `checkIds` 数组在运行时深层冻结；顺序属于协议语义，调用方不能扩展、删除或重排。

五个 Case 共包含十四个固定 Check：

| Case ID                         | Capability             | 固定 Check ID                                                                                          |
| ------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------ |
| `codex.command_hook_handler.v1` | `command_hook_handler` | `command.adapter_success.v1`、`command.envelope_projection.v1`、`command.payload_projection.v1`        |
| `codex.native_hook_input.v1`    | `native_hook_input`    | `native.pre_input_accepted.v1`、`native.post_input_accepted.v1`、`native.invalid_input_fail_closed.v1` |
| `codex.pre_file_mutation.v1`    | `pre_file_mutation`    | `pre.native_input_accepted.v1`、`pre.canonical_projection.v1`、`pre.allow_mapping.v1`                  |
| `codex.post_file_mutation.v1`   | `post_file_mutation`   | `post.native_input_accepted.v1`、`post.canonical_projection.v1`、`post.additional_context_mapping.v1`  |
| `codex.deny_file_mutation.v1`   | `deny_file_mutation`   | `deny.unauthorized_target_projection.v1`、`deny.native_response_mapping.v1`                            |

每个 Check 只有 `passed` 或 `failed`。一个 Case 的全部 Check 都为 `passed` 时，Case 才机械聚合为 `passed`；任一 Check 失败时，该 Case 聚合为 `failed`。Artifact 必须精确保存完整 Suite Definition、Definition Digest、五个 Case、全部 Check 及固定顺序。

## 5. 确定性 `observationAnchor`

Host Projection 的四条 `smoke_test` 与两条 `negative_test` 必须拥有同一个非空 `observedAt`。Application 把该唯一值作为 `observationAnchor` 传入 Contract Projector；Contract Clock 的每次读取都返回这一固定时间，五条 Contract Evidence 的 `source.observedAt` 也必须全部等于它。

因此，Contract Suite 不读取墙上时钟。相同 `scope`、`hostArtifactDigest`、`observationAnchor`、Locator Kind 与固定 Suite 定义会得到逐字段相同的 Artifact、Artifact Digest 和 Evidence。

## 6. Failed Evidence 是有效结果

Contract Check 不成立与 Projector 执行失败是两个不同状态：

- 输入 Schema、Scope、Suite 定义、摘要、运行时基础设施或持久化复验无效时，Projector 返回失败，不输出部分 Projection。
- Suite 正常完成但某个 Check 不成立时，Projector 仍返回完整、有效的 Artifact，并把对应 Case 投影为 `outcome=failed` 的 `contract_test` Evidence。

Failed Evidence 不能被丢弃或改写成“缺少证据”。当其与同 Scope 的 Host Evidence 一起进入 Matrix Compiler 时，明确且无冲突的 Contract 失败会形成 `unsupported`；这正是兼容性结论，不是测试框架异常。

## 7. 脱敏 Artifact 与五条 Evidence

Contract Artifact 使用严格 Schema `liushi.codex-hook-contract-evidence.v1`，只保存：

- 固定 Profile 与精确 Scope。
- 父 `hostArtifactDigest`。
- Suite ID、版本、Definition Digest 和固定定义。
- `observationAnchor`。
- 五个 Case 的 Check ID 与机械 Outcome。

Artifact 和 Evidence 不保存原始 Session、Turn、Tool Call ID、Model、Actor、Hook Payload、`tool_input`、`tool_response`、Patch 文本、真实响应正文、本机绝对路径或 Secret。用于断言响应映射的固定文本也不会进入 Artifact。

每个 Case 机械生成一条同 Capability 的 `contract_test` Evidence，共五条。它们都使用 `canonical_action=file_mutation` Qualifier，引用 Contract Artifact Digest、严格 Schema、该 Case 的完整 Check ID 和统一 `observationAnchor`。

Contract Artifact 以 RFC 8785 SHA-256 内容寻址，Locator 由 Digest 确定生成：

| Locator Kind      | 确定性值                                                       |
| ----------------- | -------------------------------------------------------------- |
| `repository_path` | `artifacts/executorCompatibility/codex/contract/<digest>.json` |
| `runtime_store`   | `executorCompatibility/codex/<digest>.json`                    |
| `external_uri`    | `urn:liushi:artifact:<完整 sha256 摘要>`                       |

## 8. Application 合成与双 Artifact 持久化

公开 `executor compatibility compile` 仍只接收三份原始 Host JSON，不允许调用方提交 Contract Evidence。Application 固定执行：

1. Host Projector 校验原始来源并生成独立 Host Artifact 与七条 Evidence。
2. 校验七条 Evidence 的能力/Kind 精确集合、唯一摘要、内部 Scope 和动态观察锚点。
3. 用 Host Projection 派生四项 Contract 输入，运行固定 Suite，生成独立 Contract Artifact 与五条 Evidence。
4. 校验五条 Evidence 的能力/Kind 精确集合、Artifact Digest、精确 Scope 和 `observationAnchor`。
5. 合并为恰好十二条唯一 Evidence，并拒绝 Scope 漂移或任何 `production_e2e`。
6. 用源码固定 Policy 编译 Matrix；先持久化 Host Projection，再持久化 Contract Projection，最后发布 Matrix 与 Policy。

Host 与 Contract Artifact 各有自己的 `artifactDigest`，各自的 Evidence 只绑定自己的来源 Artifact。Contract Artifact 额外保存父 `hostArtifactDigest`，形成独立内容寻址、显式父子绑定的双 Artifact 链。

Compile 成功输出使用按 Host、Contract 固定顺序排列的 `evidencePersistences`，不再使用单数 `evidencePersistence`。两项 Projection 都完成后才允许写 Matrix；其中一项已写而后续失败时，只留下不能通过 Query 单独发布的安全内容寻址孤儿。

## 9. Query 的 exact-schema allowlist

`executor compatibility query` 不按模糊类型或“最新”记录选择来源。生产 Composition Root 固定注册 exact-schema allowlist：

- `liushi.codex-compatibility-evidence.v1` 恰好一份。
- `liushi.codex-hook-contract-evidence.v1` 恰好一份。

缺失、重复、未知、非字符串或来源复验失败的 Schema 都按 `corrupt_store` 关闭式拒绝。两个来源先分别由专属 verifier 重新解析 Artifact、重算 Artifact/Evidence Digest 并确定性重投影；随后集合级校验还必须同时满足：

- Contract 的 `hostArtifactDigest` 精确等于 Host `artifactDigest`。
- Host 与 Contract 的完整 `ExecutorHostScope` 精确相同。
- Contract 的 `observationAnchor` 精确等于 Host Smoke/Negative Evidence 的唯一 `observedAt`。
- 五条 Contract Evidence 的 `observedAt` 全部等于该锚点。

只有 exact-schema、父摘要、Scope 和观察锚点全部闭合后，Query 才合并十二条 Evidence，使用源码固定 Policy 重编译，并要求重编译 Matrix 与持久化 Matrix 完全一致。

## 10. Compatible 与 Production 边界

在合成 Fixture 或通过上述输入契约校验的受验输入中，Host 七条与 Contract 五条 Evidence 全部为 `passed` 时，十二条 Evidence 会把 `managed_file_mutation_hooks.v1` 编译为 `compatible`。该结果证明编译与契约链的行为，不等于仓库已经验证某个真实 Codex 版本。

任何 Contract Case 形成明确 Failed Evidence 时，完整集合编译为 `unsupported`。缺失、重复、冲突、Scope 漂移或父子绑定漂移不会降级为 Compatible，而是关闭式失败或形成 `unverified`。

当前链路绝不声明 `production`：

- 十二条 Evidence 中没有 `production_e2e`。
- 精确 Scope 不包含 `modelId` 或 `permissionMode`。
- Package/Adapter Digest 只是内容身份，当前没有 Tarball Attestation。
- 仓库没有可追溯的真实 Host Result v2 Artifact。

因此，当前不能声明某个真实 Codex 版本已经 `compatible`，不能形成可发布版本矩阵，更不能声明 `production`。

## 11. 验证覆盖

现有验证覆盖以下边界：

- Unit：Suite Definition 深层不可变、五条 Passed Evidence、单 Check 故障生成单条 Failed Evidence、确定性重放、Scope/配置拒绝、持久化复验、重排容忍、摘要/Case/Check/Suite 篡改拒绝和脱敏检查。
- Runtime Integration：固定五个 Case 必须通过生产 `CodexHookAdapter`；受控 Post 映射故障只机械影响对应 Case。
- Application Unit：Host/Contract 顺序持久化、Contract 失败编译为 Unsupported、任一投影/持久化失败停止 Matrix 发布，以及 Scope/观察锚点漂移拒绝。
- Composition Root Integration：合成且受验输入编译十二条 Evidence 为 Compatible、跨实例 Query、双 Artifact 恢复和父 Host Digest 漂移拒绝。
- CLI E2E：首次编译、两项 `evidencePersistences`、幂等复用、按 Digest 查询、Matrix 篡改拒绝与 Not Found 退出码。

这些测试验证实现协议，不把 Fixture 提升为真实 Host 验收或发布证据。
