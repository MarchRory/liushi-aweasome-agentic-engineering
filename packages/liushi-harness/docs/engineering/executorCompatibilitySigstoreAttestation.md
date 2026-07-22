# Executor Compatibility Sigstore Attestation

**状态：P3b 已实现。** 当前 Library 与 Composition Root 已提供真实 Sigstore DSSE 签名、内容寻址 Signed Attestation Artifact，以及调用方显式 Trusted Root 驱动的纯离线验证。Attestation CLI、签名 Artifact Writer、Trusted Release Manifest、远端发布和安装选择门仍未实现。

## 1. 目标

P3b 把 P3a 已获 Human G6 Approval 的 `ReleaseAttestationDraft` 转换为可跨机器验证的签名 Artifact，同时保持以下边界：

- 业务绑定、审批记录和内容摘要由 Harness 确定性重建。
- 证书、DSSE、透明日志和可验证时间证据复用官方 Sigstore JavaScript 组件。
- Signer 只能在完整 G6 Draft 复验成功后被调用。
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
- Statement、Bundle、Artifact 和 Trusted Root 的 RFC 8785 SHA-256 摘要。
- 精确 Publisher Identity Policy 和证书扩展集合匹配。
- 验证成功后的窄化审计回执。
- 稳定错误码、Composition Root 注入和 fail-closed 行为。

Sigstore SDK 只能从 `infrastructure/executorCompatibilityAttestation/` 引入；架构测试会阻止 SDK 渗透到 Domain、Application、Presentation 或其他 Infrastructure 模块。

## 3. 模块结构

```text
application/
├── executorCompatibilityAttestation/
├── ports/executorCompatibilityAttestation/
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

Application 只依赖 Signer/Verifier Port。默认 Sigstore 实现由 Bootstrap Composition Root 装配，嵌入方可以注入自己的受信实现。

包根公开两个 Use Case、Port 契约和 `createHarnessApplication`，不直接导出 Infrastructure 具体 Adapter。调用方需要默认实现时使用 Composition Root；需要企业实现时通过 `HarnessApplicationOptions` 注入 Port，不能绕开公开装配边界。

## 4. 签名链

`SignExecutorCompatibilityReleaseAttestationUseCase` 按固定顺序执行：

1. 从 Bundle、Publisher Identity Policy、Release Candidate、DecisionRequest 和 ApprovalRecord 重新构建 P3a Draft。
2. 比较调用方 Draft 与重建 Draft 的规范摘要，拒绝任何重复字段漂移。
3. 将规范 in-toto Statement 序列化为确定字节。
4. 调用 Signer Port；默认实现使用官方 `sigstore.attest`，并关闭旧 Bundle 兼容模式。
5. 使用官方 Bundle Parser 重新解析结果，要求 Bundle v0.3、单一 DSSE 签名、精确 Payload Type 和逐字节一致的 Payload。
6. 计算 Statement、Sigstore Bundle 和完整 Artifact 摘要，返回自包含签名 Artifact。

默认 Signer 可能访问 OIDC、Fulcio 和 Rekor，并使用 Rekor v1 Inclusion Promise 提供可验证时间证据，不主动访问 TSA。调用方必须在受信 Release Workflow 中、经过 Human G6 后显式触发；P3b 不自动发布或持久化结果。通过 Port 注入的企业 Signer 可以额外生成 RFC 3161 TSA 时间戳。

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

P4 开工前必须再次确认：

- Signed Attestation Artifact 的 create-only Writer 与持久化恢复语义。
- Trusted Release Manifest 的版本、Target 和回滚保护。
- `attestation create` 与 `release verify` CLI 的 G6、身份和输出边界。
- 安装选择器如何按精确 Digest 读取 Manifest、Bundle、Attestation 和 Tarball。
- 验证通过后只生成 InstallPlan，仍由现有 G0 Apply 决定是否写入项目。

在 P4/P5 完成前，P3b 不能被描述为可发布矩阵、可信自动更新或生产安装闭环。
