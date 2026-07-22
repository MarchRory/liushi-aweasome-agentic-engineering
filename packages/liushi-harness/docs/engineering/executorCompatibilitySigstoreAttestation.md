# Executor Compatibility Sigstore Attestation

**状态：P3b 包内签名链、公共离线验证、P4c1 严格签名 Artifact Reader/create-only Writer 与 P4c2a 企业 HTTPS Authority Adapter 已实现。** 包内 Sign UseCase 已提供可信 Release Approval Authority、真实 Sigstore DSSE 签名和内容寻址 Signed Attestation Artifact；npm 根与 `HarnessApplication` 只公开调用方显式 Trusted Root 驱动的离线验证，不公开签名或 Authority 注入。P4c2b 隔离 Release Host、Attestation CLI、真实企业配置接线、远端发布和安装选择门仍未实现。

## 1. 目标

P3b 把 P3a 已获 Human G6 Approval 的 `ReleaseAttestationDraft` 转换为可跨机器验证的签名 Artifact，同时保持以下边界：

- 业务绑定、审批记录和内容摘要由 Harness 确定性重建，审批记录还必须来自注入的可信 Authority。
- 证书、DSSE、透明日志和可验证时间证据复用官方 Sigstore JavaScript 组件。
- Signer 只能在完整 G6 Draft 与 Authority 权威回执精确匹配后被调用。
- Verifier 只使用调用方显式提供的 Trusted Root，不读取 TUF、网络或用户缓存。
- 发布者身份必须同时精确匹配 Issuer、SAN 和 Policy 声明的全部证书扩展。
- 任何摘要、Payload、证书身份或信任材料漂移都关闭式失败。

该能力不会创建 Trusted Release Manifest，不会选择可安装版本，也不会执行 G0 Apply。

P3b 验证的是“证书身份与 Artifact 内已签 Identity Policy 一致”，不是“消费者已经授权该身份”。安装端只有在 P4 使用外部 Trust Profile 钉住 Trusted Root Digest、稳定 Publisher Trust Policy 和 Bootstrap Manifest Digest，并从签名 Release Subject 派生本次 Source Revision 约束后，才能把该回执纳入发布信任判断；禁止把 Artifact 自带 Policy 或 Root 当成自认证信任锚。

## 2. 复用与自持边界

P3b 固定复用 Node 20 兼容的 Sigstore 组件：

| 组件                             | 用途                                                          |
| -------------------------------- | ------------------------------------------------------------- |
| `sigstore@4.1.1`                 | 通过官方 `attest` 入口生成 DSSE Bundle                        |
| `@sigstore/bundle@4.0.0`         | 解析、判别和规范化 Bundle v0.3                                |
| `@sigstore/verify@3.1.1`         | 使用显式 Trust Material 验证签名、证书链、CT、TLog 和时间证据 |
| `@sigstore/protobuf-specs@0.5.0` | 解析 Trusted Root v0.2                                        |
| `@sigstore/core@3.2.1`           | 按 ASN.1 DER 规则解码 Fulcio v2 自定义证书扩展                |

Harness 自持以下语义：

- G6 Draft 的五项权威输入与重复绑定字段复验。
- 只按审批主题和制品摘要查询的 Authority Port，以及绑定完整权威记录的内容寻址回执。
- Statement、Bundle、Artifact 和 Trusted Root 的 RFC 8785 SHA-256 摘要。
- 精确 Publisher Identity Policy 和证书扩展集合匹配。
- 验证成功后的窄化审计回执。
- 稳定错误码、Composition Root 注入和 fail-closed 行为。

Sigstore SDK 只能从 `infrastructure/executorCompatibilityAttestation/` 引入；架构测试会阻止 SDK 渗透到 Domain、Application、Presentation 或其他 Infrastructure 模块。

## 3. 模块结构

```text
application/
├── executorCompatibilityAttestation/
├── executorCompatibilityReleaseApproval/
├── ports/executorCompatibilityAttestation/
├── ports/executorCompatibilityReleaseApprovalAuthority/
└── useCases/
    ├── signExecutorCompatibilityReleaseAttestation/
    └── verifyExecutorCompatibilityReleaseAttestation/

infrastructure/executorCompatibilityAttestation/
├── adapter/
├── client/
├── constants/
├── contracts/
├── identity/
├── serialization/
└── validation/
```

包内 Sign Application 只依赖 Signer 与 Release Approval Authority Port，公开 Application 只装配离线 Verifier。当前 Bootstrap Composition Root 不创建 Signer、不接收 Authority/Signer 注入，也不返回 Sign UseCase；P4c 的隔离 Release Host 必须固定从企业可信审批源读取记录的 Adapter 与发布凭据。

包根公开 Verify UseCase、只读 Domain/Application 能力和 `createHarnessApplication`，不导出两个 Sign UseCase、Authority 回执工厂或 Infrastructure Signer。`HarnessApplicationOptions` 只允许替换离线 Verifier；企业签名不能通过普通嵌入式 Options 启用。

## 4. 签名链

包内 `SignExecutorCompatibilityReleaseAttestationUseCase` 按固定顺序执行：

1. 从 Bundle、Publisher Identity Policy、Release Candidate、DecisionRequest 和 ApprovalRecord 重新构建 P3a Draft。
2. 比较调用方 Draft 与重建 Draft 的规范摘要，拒绝任何重复字段漂移。
3. 仅以 `ReleaseCandidate` 审批主题和 Candidate Digest 查询可信 Authority，不把调用方 Draft 中的记录传给 Authority。
4. 严格重算 Authority 回执、DecisionRequest、ApprovalRecord 和 G6 语义，并要求权威记录摘要与待签名 Draft 精确一致。
5. 将规范 in-toto Statement 交给 Signer Port；默认实现使用官方 `sigstore.attest`，并关闭旧 Bundle 兼容模式。
6. 使用官方 Bundle Parser 重新解析结果，要求 Bundle v0.3、单一 DSSE 签名、精确 Payload Type 和逐字节一致的 Payload。
7. 计算 Statement、Sigstore Bundle 和完整 Artifact 摘要，返回自包含签名 Artifact。

Signer 可能访问 OIDC、Fulcio 和 Rekor，并使用 Rekor v1 Inclusion Promise 提供可验证时间证据，不主动访问 TSA。它当前只在包内测试链中运行，不可从 npm 根、公共 Composition Root 或 CLI 触发；P4c 必须在隔离 Release Host 中固定可信审批源和凭据。权威记录与 Draft 不一致时 Signer 不会被调用。P3b 不自动发布或持久化结果；后续企业 Signer 可以额外生成 RFC 3161 TSA 时间戳。

## 5. 离线验证链

`VerifyExecutorCompatibilityReleaseAttestationUseCase` 按固定顺序执行：

1. 严格解析 Signed Attestation Artifact。
2. 重建 P3a Draft，并重新计算 Statement、Bundle 和 Artifact 摘要。
3. 严格解析调用方通过受信通道提供的 Trusted Root v0.2，并计算其摘要。
4. 要求 Trusted Root 至少包含 CA，且 CT/TLog 数量满足 Publisher Identity Policy 阈值。
5. 使用 `@sigstore/verify` 的显式 Trust Material 验证 DSSE、证书链、CT、TLog，以及至少一个来自 Rekor Inclusion Promise 或 RFC 3161 TSA 的可验证时间证据。
6. 精确匹配证书 Issuer 与完整 SAN。
7. 对每个 Policy 要求的 Fulcio v2 OID，要求恰好出现一次，并按规范 DER UTF8String 解码后比较值。
8. Verifier Port 必须返回从证书实际解出的受管扩展；Application 再次比较该集合，拒绝缺失、重复和额外的受管扩展。
9. 返回只包含 Artifact、Statement、Bundle、Candidate、Trusted Root 摘要和实际签名身份的验证回执。

Verifier 不调用顶层 `sigstore.verify`，也不启用 TUF 自动更新。进入验证阶段后即使网络完全禁用，输入完整时仍可通过。

## 6. 失败语义

| 场景                                                         | 错误码                                                   |
| ------------------------------------------------------------ | -------------------------------------------------------- |
| Draft、Artifact、Trusted Root Schema 或摘要漂移              | `invalid_input`                                          |
| 联网签名、OIDC、Fulcio、Rekor 或 Bundle 生成失败             | `executor_compatibility_attestation_signing_failed`      |
| DSSE、证书链、CT/TLog、时间证据、Issuer、SAN 或 OID 验证失败 | `executor_compatibility_attestation_verification_failed` |

CLI 稳定映射中，签名失败属于暂不可用，验证失败属于冲突。当前没有 Attestation CLI；该映射为后续 Presentation 接入预留一致语义。

## 7. 测试证据

当前测试覆盖：

- Authority 不可用时两个包内 Release Signer 入口都失败关闭。
- 调用方伪造摘要自洽的 Human 记录、跨审批主题/制品回执或篡改回执摘要时 Signer Port 不会被调用。
- Draft 漂移时 Signer Port 不会被调用。
- Signer 明确失败不会被吞掉或改写。
- Artifact、Statement、Bundle 和 Trusted Root 摘要重算。
- 额外、重复或错误证书扩展关闭式失败。
- DER UTF8String 的合法 Unicode、错误 Tag、原始文本和尾随字节。
- 使用官方 `sigstore.attest` 与本地 CA、CT Log、Rekor v1 完成默认路径真实签名。
- 使用官方 DSSE Builder 与本地 CA、CT Log、Rekor v2、RFC 3161 TSA 完成增强路径真实签名。
- 两条路径都在签名完成后禁用全部网络，再使用生产 Verifier 完成正向离线验证。
- 错误 Workflow SAN 和篡改 DSSE Payload 的负向验证。

测试支持层只适配官方本地 Mock 的测试数据建模差异，不修改生产 Signer、Verifier 或信任策略。

## 8. 后续门

P4c-P4e 继续实现前必须确认：

- P4c1 已提供的 Signed Attestation/Manifest Reader 与 create-only Writer 如何接入隔离 Host，并保持受信输出根只能由 Host 配置。
- Trusted Release Manifest 的 Target、Accepted Head 和回滚保护。
- 隔离 Release Host 如何把企业审批 Store/Wiki/Ticket 系统适配为只读 Authority，且不允许调用方记录回流为可信源或替换发布凭据。
- `attestation create` 与 `release verify` CLI 的 G6、身份和输出边界。
- 安装选择器如何按精确 Digest 读取 Manifest、Bundle、Attestation 和 Tarball。
- 验证通过后只生成 InstallPlan，仍由现有 G0 Apply 决定是否写入项目。

在 P4/P5 完成前，P3b 不能被描述为可发布矩阵、可信自动更新或生产安装闭环；包内签名测试也不等同于已接入隔离 Release Host 或企业审批系统。
