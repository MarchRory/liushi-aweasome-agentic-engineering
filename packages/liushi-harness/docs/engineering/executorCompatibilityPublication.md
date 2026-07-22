# Executor Compatibility 发布信任链

**状态：技术方案已冻结，P1 确定性 Publication Bundle、P2 create-only CLI 原子文件输出、P3a Release Attestation Domain 协议与 P3b Sigstore Signing/Offline Verification 已实现。当前不会上传、安装、更新 Trusted Release Manifest 或写入 Repository；Attestation CLI 和签名 Artifact Writer 尚未实现。**

## 1. 目标

真实 Host 验收已经能够把精确 Executor Scope 编译为内容寻址 Matrix，但本机 Runtime Store 仍是维护者可写边界，不能直接成为安装信任根。本方案把“本机证据成立”提升为“跨机器可验证且只能由受信发布身份声明”的发布链。

发布链必须同时证明：

- Matrix、Policy、全部 Evidence 和来源 Artifact 没有被替换或拆分重组。
- Matrix 绑定的 Adapter Digest 与实际 npm Tarball Digest 一致。
- 发布来源绑定精确 Repository、Source Revision、包名和包版本。
- Human 已批准精确 Bundle Digest；任何内容变化都必须重新审批。
- 签名来自安装方显式信任的发布者身份，而不只是“某个有效证书”。
- 安装方按精确 Digest 验证，不读取“最新本机记录”，也不信任可写 Fixture。

## 2. 不做什么

- 不自行设计密码算法、证书格式或透明日志。
- 不把 RFC 8785 Content Digest 当作签名。
- 不让 Domain 读取私钥、网络、环境变量或当前时间。
- 不把 Sigstore、in-toto、DSSE 类型渗透到 Matrix Compiler。
- 不在首个切片实现远端自动更新、`latest` 选择、回滚保护或 TUF Repository。
- 不因 Publication Bundle 生成成功就声明 `production`。

## 3. 三层协议

### 3.1 Publication Bundle

Publication Bundle 是确定性、脱敏、自包含但尚未受信的 JSON Artifact。它包含：

- 精确 npm 包名、版本、Tarball Digest、源码仓库和 Source Revision。
- 完整 Executor Compatibility Matrix 与 Policy。
- 已经通过来源专属 Projection Set Verifier 的全部脱敏 Artifact 和 Evidence。
- 排除自身后按 RFC 8785 和 SHA-256 计算的 `bundleDigest`。

相同规范输入必须生成相同 Bundle 和 Digest。Bundle 不读取系统时间；需要审计时间时只能使用已经存在于受验证据中的时间，或由上层作为显式输入提供。

Bundle 本身不包含签名，不具备发布者身份，也不能直接驱动安装。

### 3.2 Release Attestation

Release Attestation 使用 [in-toto Statement v1](https://github.com/in-toto/attestation/blob/main/spec/v1/statement.md) 表达发布声明，并由 Sigstore DSSE Bundle 承载签名和验证材料。

Statement Subject 至少绑定：

- Publication Bundle 的 SHA-256 Digest。
- npm Tarball 的 SHA-256 Digest。

自定义 Predicate 绑定：

- `matrixDigest`、`bundleDigest` 和精确 Executor Scope。
- 包名、版本、Repository 与 Source Revision。
- G6 Human Approval Record 的稳定 Digest。
- 发布者声明的 Workflow 或 Release Identity。

P3a 将 G6 分为两个确定性阶段：先生成绑定 Bundle、Matrix、Tarball、固定发布者 Identity Policy 和目标位置的 `ReleaseCandidate`，供 Human 审阅；Human Approval 产生后，再以同一 Candidate、`DecisionRequest` 和 `ApprovalRecord` 创建 `ReleaseAttestationDraft`。Draft 保留完整审批记录供后续离线复验，待签名 Statement 只公开绑定其稳定 Digest 的 G6 证明。

Publisher Identity Policy 必须固定精确 OIDC Issuer、具体 SAN URI 或 Email、Runner Environment、Source Repository URI、完整 Source Revision、CT Log 阈值与 Signature Transparency Log 阈值。URI 身份不能只写域名根地址；GitHub Actions 场景必须固定具体 Workflow Identity 与 `github-hosted` 或经 Human 审批的精确 Runner Environment。Candidate、Identity、Target、Bundle 或审批记录任一变化都会使旧 Approval 失效。

签名实现复用官方 Sigstore 客户端。具体依赖版本必须同时满足 Node `>=20.19.0`、离线验证、固定身份校验和锁定版本测试；不因最新版 API 存在就提升项目 Node 基线。

### 3.3 Trusted Release Manifest

Trusted Release Manifest 是安装选择器唯一可消费的发布索引。每个 Target 只引用精确：

- 包名与版本。
- Tarball Digest。
- Publication Bundle Digest。
- Matrix Digest。
- Sigstore Bundle Digest 或内容寻址位置。
- 允许的 Executor Scope 与最低支持等级。

Manifest 不能使用“读取 Store 中最新 Matrix”的语义。未来出现远端自动更新、镜像、委托角色、密钥轮换、回滚和冻结攻击边界时，直接采用 TUF Targets/Snapshot/Timestamp 模型，不在 Harness 内实现一个简化替代品。TUF 的 Target Hash、Length、签名阈值和版本回滚规则见 [The Update Framework Specification](https://theupdateframework.github.io/specification/)。

## 4. Human Gate

内存中的 Publication Bundle 创建是 R0，只读且无外部副作用。`bundle create --output` 是调用方显式指定目标的 R1 本地 Artifact 创建：只允许绝对路径，只创建或幂等复用完全相同的规范字节，绝不覆盖既有 Human 文件。该动作本身不需要 G6，但仍受宿主 Sandbox、文件权限和 Tool Approval 约束。

以下动作属于 Release，必须进入 G6：

- 为 Bundle 创建受信 Attestation。
- 写入或更新 Trusted Release Manifest。
- 将 Bundle、Attestation 或 Manifest 发布到 npm、GitHub Release、Wiki 或企业 Artifact Registry。
- 让安装选择器首次信任新的发布者身份、OIDC Issuer、Repository 或 Workflow。

G6 Approval 必须绑定精确 `bundleDigest`、`matrixDigest`、Tarball Digest、发布者身份约束和目标发布位置。任何字段变化都使 Approval 失效。`actorId` 仍只是审计声明；企业使用必须由外部身份系统或受信 Wrapper 注入并验证。

P3a 不把 G6 接入现有 `SupportedArtifact` Task Aggregate。该 Aggregate 当前只承载 Requirement、Business Logic、PlanRisk 与 Project Profile Artifact；错误把 G6 投递到旧 Artifact 流会关闭式失败。Release Workflow/Cell 的持久化状态迁移属于后续 Application 切片，接入前必须再次确认业务语义。

## 5. 领域模型

首个切片新增独立模块 `domain/executorCompatibilityPublication/`，不把发布职责塞入现有 Matrix 文件：

```text
domain/executorCompatibilityPublication/
├── constants/
├── contracts/
├── digest/
├── factory/
├── schemas/
├── validation/
└── index.ts
```

核心类型：

```ts
/** npm 发布物与源码来源的稳定身份。 */
export interface ExecutorCompatibilityReleaseSubject {
  readonly packageName: string;
  readonly packageVersion: string;
  readonly packageDigest: ContentDigest;
  readonly repositoryUri: string;
  readonly sourceRevision: string;
}

/** 可发布 Bundle 中的一项脱敏来源投影。 */
export interface ExecutorCompatibilityPublishedProjection {
  readonly artifact: unknown;
  readonly artifactDigest: ContentDigest;
  readonly evidence: readonly ExecutorCapabilityEvidence[];
}

/** 尚未获得发布者身份的确定性兼容性发布候选。 */
export interface ExecutorCompatibilityPublicationBundle {
  readonly schemaVersion: string;
  readonly releaseSubject: ExecutorCompatibilityReleaseSubject;
  readonly matrix: ExecutorCompatibilityMatrix;
  readonly policy: ExecutorCompatibilityPolicy;
  readonly projections: readonly ExecutorCompatibilityPublishedProjection[];
  readonly bundleDigest: ContentDigest;
}
```

协议字段使用枚举表达封闭集合；类型和公开函数必须使用中文 TSDoc。文件继续使用 lower camelCase，并由各目录 `index.ts` 导出。

## 6. Bundle 不变量

Bundle Factory 在返回成功前必须关闭式验证：

1. Matrix、Policy、Evidence 和 Projection 均通过严格 Schema。
2. Matrix `policyDigest` 等于当前完整 Policy 的重新计算结果。
3. Matrix `evidenceDigests` 与全部 Projection 展平后的 Evidence Digest 集合完全相等。
4. 每条 Evidence 的 Scope 与 Matrix Scope 精确相等。
5. 每个 `artifactDigest` 与规范化 Artifact 内容一致。
6. 每个 `evidenceDigest` 与规范化 Evidence 内容一致。
7. Projection 集合经过来源专属 Verifier 重投影和跨来源关系校验。
8. `releaseSubject.packageDigest` 等于 Matrix `scope.adapterDigest`。
9. Projection 按 `artifactDigest`、Evidence 按 `evidenceDigest` 稳定排序。
10. Bundle Digest 排除自身字段后计算；未知字段、重复项和顺序歧义全部拒绝。

Domain 负责通用结构、集合与 Digest 不变量。来源 Artifact 的专属语义继续由 Application 注入的 `ExecutorCompatibilityEvidenceProjectionSetVerifierPort` 负责，Domain 不依赖 Codex 或 Infrastructure。

## 7. Application 与 Infrastructure 边界

### 7.1 Application

`CreateExecutorCompatibilityPublicationBundleUseCase`：

1. 按调用方提供的精确 `matrixDigest` 读取 Matrix 记录。
2. 锚定源码内受信 Policy，不信任 Store 自带 Policy 声明。
3. 恢复全部 Projection，并执行现有 Projection Set Verifier。
4. 重新编译 Matrix，并要求结果与请求 Digest 完全一致。
5. 将已复验内容交给 Domain Bundle Factory。
6. 返回 Bundle，不写发布文件、不签名、不联网。

Query 与 Bundle Create 应复用一个 Application 内部的“受信 Compatibility Record 重建服务”，避免两条路径复制验证逻辑或产生不同信任口径。

`PublishExecutorCompatibilityPublicationBundleUseCase` 复用同一个 Bundle Creator，并只在创建成功后调用 `ExecutorCompatibilityPublicationWriterPort`。输出是带 Schema Version、Disposition、路径、Bundle/Matrix/Tarball Digest 和字节数的窄回执，不把两项 Projection 与十二条 Evidence 刷到 stdout。

P3b 已交付 Application Signing/Verification Port、真实 Sigstore Adapter、内容寻址 Signed Attestation Artifact 和窄化验证回执。Signing Use Case 会在任何联网调用前重建完整 G6 Draft；Verification Use Case 会重算 Artifact、Statement、Bundle 与 Trusted Root 摘要，并要求离线密码学验证返回的发布者身份与 P3a Policy 完全一致。签名 Artifact Writer、CLI、Manifest 和安装选择门仍未实现；任何调用方都不能把内存中的验证成功直接当成已发布或可安装声明。

### 7.2 Infrastructure

- 继续复用现有内容寻址 Evidence/Matrix Store。
- Sigstore Adapter 只实现 Application Signing/Verification Port。
- 私钥、OIDC Token、Fulcio、Rekor、TUF Root 和网络重试不进入 Domain。
- `NodeExecutorCompatibilityPublicationWriterAdapter` 先重验 Bundle Digest，再使用 RFC 8785 规范 JSON 和单一末尾换行生成稳定字节。
- 文件输出先在目标同目录创建 `wx` 临时文件并完成文件 `fsync`，再通过无覆盖硬链接原子暴露完整目标，删除临时链接后刷新父目录。目标已存在时只有规范字节完全相同才返回 `idempotent_reuse`；内容或文件类型不同返回 `precondition_not_met`。
- 发布目标已经可见后出现清理、父目录耐久性或写后复验失败，返回 `executor_compatibility_publication_commit_outcome_unknown`，禁止调用方盲目自动重试。
- 不支持安全无覆盖硬链接语义的文件系统关闭式失败；不退化为“先检查再 rename”或可覆盖写入。
- OS 差异只进入 Infrastructure Platform Adapter，不写入 Domain 或 Use Case 分支。

### 7.3 Presentation

CLI 按三步交付：

```text
executor compatibility bundle create --matrix-digest <sha256> --package-name <name> --package-version <version> --package-digest <sha256> --repository-uri <https-url> --source-revision <full-revision> --output <absolute-path> [--store <path>] [--json]
executor compatibility attestation create
executor compatibility release verify
```

`bundle create` 已实现。它按精确 Matrix Digest 重建 Bundle，并以 create-only 语义写入绝对输出路径；重跑相同输入返回 `idempotent_reuse`，既有不同文件保持不变并返回 Conflict。P3b 已提供 Library 与 Composition Root 级签名和显式 Trusted Root 离线验证，但 `attestation create` 与 `release verify` CLI 尚未实现；Attestation 与 Release Manifest 写入必须要求精确 G6 Approval。未来 `release verify` 默认复用现有离线 Verifier，并在 Presentation 层补齐文件读取、输出和恢复语义。

可复现实例：

```powershell
liushi-harness executor compatibility bundle create `
  --matrix-digest <sha256:64hex> `
  --package-name liushi-harness `
  --package-version <exact-version> `
  --package-digest <npm-tarball-sha256> `
  --repository-uri https://github.com/MarchRory/liushi-aweasome-agentic-engineering `
  --source-revision <full-git-revision> `
  --output <absolute-path-to-bundle.json> `
  --store <trusted-runtime-store> `
  --json
```

`packageDigest` 必须与 Matrix Scope 的 `adapterDigest` 精确相等。输出文件是完整、规范且未签名的 Bundle；JSON stdout 只包含写入回执。

## 8. 安装选择门

安装选择器收到候选后必须按以下顺序失败关闭：

1. 验证 Trusted Release Manifest 的受信身份与内容完整性。
2. 按精确 Digest 读取 Bundle 和 Attestation，不按文件修改时间或语义版本猜测。
3. 验证 Sigstore Bundle、证书链、OIDC Issuer、Repository 与 Workflow Identity。
4. 验证 in-toto Subject 与实际 Bundle/Tarball Digest。
5. 完整重算 Bundle、Projection、Evidence、Policy 与 Matrix。
6. 验证 G6 Approval 绑定。
7. 精确匹配目标 Executor Scope 与最低支持等级。
8. 生成 InstallPlan，仍由现有 G0 Apply 决定是否写入项目。

发布信任不能绕过 Project Trust、Hook Definition Trust、G0、G2、G4 或其他业务 Gate。

## 9. 测试与验收

### 9.1 首个 Bundle 切片

- 同一输入在不同数组顺序下生成相同 Bundle Digest。
- Tarball Digest 与 Adapter Digest 不一致时拒绝。
- 缺失、重复、额外或篡改 Evidence 时拒绝。
- Artifact、Policy、Matrix 任一内容变化时拒绝。
- Store 中存在更晚 Matrix 时仍只读取调用方指定 Digest。
- Bundle 不包含绝对路径、原始 Session/Turn/Tool Call ID 或 Secret。
- Application、Architecture、TypeScript、ESLint、Prettier、Build 和 Tarball Smoke 全部通过。
- CLI 只接受绝对输出路径，首次创建、幂等复用、并发相同输入、既有不同文件和提交结果未知均有动态测试。
- 输出字节必须严格等于 `RFC8785(bundle) + "\n"`，任何临时文件不能在成功返回后残留。

### 9.2 Attestation 与安装门切片

- P3a 已覆盖 Issuer 根 URI、具体 SAN、Runner Environment、Repository/Revision 证书扩展、稳定扩展排序和重复 OID 拒绝。
- P3a 已覆盖 Candidate 对 Bundle、Matrix、Tarball、Identity Policy 与发布目标的精确 Digest 绑定。
- P3a 已覆盖 G6、R4、Review Checkpoint、Human Actor、Approved Decision、审批时间顺序和两份审批摘要重算。
- P3a 已覆盖 in-toto 双 Subject、Predicate、Identity Policy、G6 Binding、未知字段和旧 Candidate 漂移拒绝。
- P3b 已覆盖有效 Sigstore Bundle 但 Workflow SAN、Issuer 或自定义 OID 身份不匹配时拒绝。
- P3b 已覆盖 Subject、Predicate、Approval、Bundle Payload 和 Artifact Digest 漂移时拒绝。
- P3b 要求调用方显式提供 Trusted Root v0.2，并离线验证证书链、CT、TLog，以及至少一个来自 Rekor Inclusion Promise 或 RFC 3161 TSA 的可验证时间证据。
- 只信任证书有效性、未固定 Issuer/Repository/Workflow 的配置固定拒绝。
- 旧版已签名 Manifest 不能覆盖更高受信版本；实现远端更新前不得提供 `latest`。
- 正向最终生成 InstallPlan，但不会自动执行 G0 Apply。

## 10. 交付顺序

1. `P1`：Domain Bundle、可信记录重建服务、Bundle Create Use Case 与完整测试。已完成。
2. `P2`：Bundle CLI、原子文件输出与可复现实例。已完成。
3. `P3a`：in-toto Statement、固定发布者 Identity Policy、Release Candidate 与 G6 Approval 绑定。已完成。
4. `P3b`：Node 20 兼容的 Sigstore Signing/Verification Port、显式 Trusted Root 离线验证与签名 Artifact。已完成。
5. `P4`：Trusted Release Manifest、离线 Verify 和安装选择门。
6. `P5`：在 GitHub Actions/npm Provenance 中生成真实 Attestation，执行干净 Consumer E2E。
7. `P6`：Codex 发布链闭合后，为 Claude-compatible/CatPaw 分别产生独立 Scope、Evidence 和发布记录。

每个切片独立提交。P1/P2/P3a 不引入私钥或网络副作用；P3b 的默认 Signer 可能访问 OIDC、Fulcio 和 Rekor，只能在完整 G6 复验后由受信 Release Workflow 显式调用。默认路径使用 Rekor v1 Inclusion Promise，不主动访问 TSA；自定义 Signer 可以提供额外 RFC 3161 时间戳。发布、Manifest 和信任根变更仍必须由 Human 显式批准。实现细节见 [Executor Compatibility Sigstore Attestation](./executorCompatibilitySigstoreAttestation.md)。
