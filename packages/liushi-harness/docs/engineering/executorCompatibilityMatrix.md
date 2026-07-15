# 执行器兼容性矩阵

## 目标

Executor Compatibility Matrix 把平台原生 Probe、Contract Test、Smoke Test、Negative Test 和真实 Host E2E 归一化为可审计的支持声明。它解决的是“哪一个 Adapter 实现，在什么精确宿主范围内，对哪一个能力 Profile 有多少证据”，而不是笼统判断某个产品名称是否兼容。

当前第一个 Profile 是 `managed_file_mutation_hooks.v1`。它只评估受控文件变更所需的 Command Hook、原生输入、Pre/Post 生命周期和关闭式拒绝，不代表执行器的全部工具、Agent、Memory、MCP 或安全能力。

## 分层边界

- Domain 只定义规范能力、证据等级、支持 Policy、精确 Host Scope 和确定性编译算法。
- Application 选择受信任 Policy，编排 Evidence/Matrix 持久化，并在查询时重新编译。
- Infrastructure 负责解析 Codex、Claude Code 或 CatPaw 的原生命令、事件和配置，投影为规范 Evidence，并实现内容寻址 File Store。
- Presentation 只处理原始来源文件、精确 Matrix Digest、JSON 和摘要输出，不解释平台原生字段。

平台专属 JSON、事件名、工具名和 Shell 转义不得进入 Domain。Codex `PreToolUse`、Claude-compatible Hook 事件和 CatPaw 差异分别留在各自 Adapter 中。

## 精确 Host Scope

Matrix 不允许跨以下字段传播结论：

- Adapter Kind。
- 实际 Distribution，例如 Codex CLI、Claude Code 或 CatPaw。
- Adapter npm Tarball 或实现 Artifact Digest。
- 执行器精确版本。
- Interactive TUI、Non-interactive CLI、Desktop、IDE 或 App Server Surface。
- OS 与 CPU Architecture。
- 动态验收使用的 Model ID 与 Permission Mode。
- 平台配置投影 Digest。

CatPaw 可以消费 Claude-compatible Adapter，但不能继承 Claude Code 的 Evidence。Windows TUI Evidence 也不能推广到 Linux、Desktop、App Server 或相邻版本。

## Codex 当前投影边界

Codex Compatibility Evidence Projector 当前只投影以下精确 Scope：Codex Adapter、Codex CLI Distribution、npm Tarball/Adapter Digest、Codex 版本、Interactive TUI、实测 OS/Architecture 和平台配置 Digest。它不会从 Activation Plan 推断运行时 Model 或 Permission，因此输出的 `ExecutorHostScope` 不包含 `modelId` 和 `permissionMode`。Host Result v2 的 `matrixSupportClaim=not_evaluated` 只表示它是受验来源，不是 Matrix 的支持等级。

## Evidence

每份 `ExecutorCapabilityEvidence` 必须包含：

- 完整且相同的目标 Host Scope。
- 单一规范 Capability 和覆盖范围 Qualifier。
- `static_probe`、`contract_test`、`smoke_test`、`negative_test` 或 `production_e2e` Evidence Kind。
- `passed`、`failed` 或 `inconclusive` Outcome。
- 原始 Artifact Digest、Schema Version、检查项、审计时间和可复核 Locator。

Repository 与 Runtime Store Locator 必须是无 `..`、无绝对路径、统一使用 `/` 的相对 Locator。External URI 只接受 `urn:liushi:artifact:<source.artifactDigest>` 形式的内容寻址标识，并且其中的摘要必须与同一 Evidence 的 `source.artifactDigest` 精确相等；Domain 不接受或解析任意网络 URL，实际外部系统地址只能由受信 Infrastructure Adapter 解析。发布 Evidence 不保存原始 Session、Turn、Tool Call ID、本机绝对路径或 Secret。

`observedAt` 只用于审计。真实需求的 Artifact 不执行时间失效算法，也不会因为经过固定天数自动降级；Evidence 是否继续被选入新 Matrix，由新测试结果、配置或版本变化以及 Human 决策决定。

## 编译算法

1. 严格校验 Policy、Target Scope 和所有 Evidence Schema。
2. 拒绝 Adapter/Distribution 错配、Scope 漂移、重复来源记录、重复 Qualifier 和 Profile 外 Evidence。
3. 对每个 Capability Requirement 分别检查所需 Evidence Kind。
4. 同一 Requirement Kind 的全部记录只有 `passed` 时为 `satisfied`，全部只有 `failed` 时为 `failed`；多个不同 Outcome 同时存在时为 `conflicting`，只有 `inconclusive` 或没有记录时为 `missing`。
5. `production` 只有在 Production Scope 字段和全部 Requirement 闭合后产生；`compatible` 使用同一 Profile 的较低但完整证据门。
6. 部分正向 Evidence 只能产生 `experimental`；明确且无矛盾的失败产生 `unsupported`；缺失或冲突产生 `unverified`。
7. `unsupported` 与 `unverified` 都不能进入生产安装或执行路径。
8. `degraded` 只能来自后续 Policy 明确声明并验证的替代路径，编译器不会自行推断降级方案。
9. Policy、Evidence 和 Matrix 都以 RFC 8785 SHA-256 Digest 绑定，输入顺序不影响 Matrix Digest。
10. 持久化 Matrix 的重新校验必须同时提供受信 Policy 与完整 Evidence 集，校验器会重算 Evidence Digest、重新编译预期 Matrix 并比较内容摘要；Matrix 自报的 Assessment 不能作为支持等级真源。

## Managed File Mutation Hook Policy

`compatible` 要求覆盖 Command Handler、Native Hook Input、Pre/Post File Mutation 和 Deny File Mutation，并分别提供 Profile 指定的 Static、Contract、Smoke 与 Negative Evidence。

`production` 是 `compatible` 的严格超集，还要求每项 Capability 都有真实 `production_e2e` Evidence，并要求 Scope 明确绑定 Model、Permission 和 Configuration Digest。静态 Probe 的 `verified` 不能单独生成 Production 声明。

当前 Codex 投影固定生成 7 条 Evidence：1 条 `static_probe`、4 条 `smoke_test` 和 2 条 `negative_test`；不生成 `contract_test` 或 `production_e2e`。由于 `managed_file_mutation_hooks.v1` 的 Compatible 要求包含 Contract Evidence，Production 还要求 Model、Permission 和 Production E2E，当前固定 Policy 的最高编译等级只能是 `experimental`，不能声明 `compatible` 或 `production`。

## 当前边界

当前代码已实现 Domain Policy、严格校验、细分 Assessment、确定性 Matrix 编译和完整性重算，也已实现 Codex Static Probe/Host Result v2 的脱敏 Evidence 投影、内容寻址 Evidence/Matrix Store，以及 `executor compatibility compile/query` CLI。Query 会要求持久化 Policy 与源码固定 Policy 一致，从 Codex Artifact 确定性重投影全部 Evidence，再以 Domain Compiler 重编译并比对精确 Matrix。投影器会重新校验 Prepare v5、Activation Plan v2、Host Result v2 的完整 Schema、摘要、项目与 Worktree 拓扑、Task/PlanRisk、固定命令与场景、唯一精确版本、13 项检查、时序和运行时环境绑定；输出不含绝对路径及原始 session、turn、tool call 标识。内容寻址用于证明受信 `matrixDigest` 下的完整性，不替代 Human Approval、受信发布清单或未来 Attestation。仓库当前没有可追溯的真实 v2 Host Artifact；Contract Evidence 和 Claude-compatible/CatPaw Adapter 仍是后续切片。
