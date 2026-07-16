# Codex Host v2 验证记录

**状态：2026-07-16 已完成一次真实 Codex CLI 0.144.5、Windows x64、Interactive TUI 的 Host Result v2 验证，并由 Host/Contract 双 Projection 编译为 `compatible`。该记录不是 `production` 声明，也不是受信发布矩阵。**

## 1. 验证结论

本次维护者验证使用当前仓库提交 `2341d57` 构建 `liushi-harness@0.0.0` Tarball，在固定公开项目 `unjs/defu@82632b66f5914e9946edce300e10633a3d5c0cb7` 中完成同一 Codex TUI 会话的正向与负向 Host Smoke。

- `verify-result` 返回 Host Result v2，`hostEvidenceVerified=true`，13 项检查全部通过。
- `executor compatibility compile` 生成 7 条 Host Evidence、5 条 ContractTest 和两项独立 Artifact。
- 固定 Policy 将精确 Scope 编译为 `supportLevel=compatible`。
- `executor compatibility query` 从持久化 Store 重读全部 Artifact、Evidence、Policy 和 Matrix，并返回 `recomputed=true`。
- 负向挑战文件没有创建；正向只在 `test/utils.test.ts` 增加一行；正向 Pre/Post 属于同一 invocation，负向 Pre 属于同一 session 的独立 invocation 且没有 Post。

## 2. 精确 Scope

| 字段                 | 值                                                                        |
| -------------------- | ------------------------------------------------------------------------- |
| Adapter Kind         | `codex`                                                                   |
| Distribution         | `codex_cli`                                                               |
| Executor Version     | `0.144.5`                                                                 |
| Surface              | `interactive_tui`                                                         |
| Operating System     | `windows`                                                                 |
| Architecture         | `x64`                                                                     |
| Adapter Digest       | `sha256:0aed822e472a5b2aba5755c0e1aa09ee09007c9527bbcd72a71bfe0e9315f10b` |
| Configuration Digest | `sha256:b68f4c386d65004514928a26bfe8e87c9a2240dd3df32e3159facbb38aa10b49` |
| Profile              | `managed_file_mutation_hooks.v1`                                          |
| Support Level        | `compatible`                                                              |

Activation Plan 使用 `gpt-5.6-sol`、`low` reasoning effort 和 `workspace-write`。Matrix 不从 Activation Plan 推断 `modelId` 或 `permissionMode`，因此这三个运行参数不进入当前兼容性 Scope。

## 3. 内容身份

| Artifact             | Digest                                                                    |
| -------------------- | ------------------------------------------------------------------------- |
| Activation           | `sha256:315addde185dfe3ae4018a7ffe21a3b4ced7a4d9d307d2da63bc54c499cb41b1` |
| Prepare Manifest     | `sha256:0ddff480741213b3d150642d2071a97daeaa1261e7c9441bc0a5b12a4112eec8` |
| Activation Plan      | `sha256:e8b95c349eca2c22bfaa5798c48d35caf2f962b8c4955220154d2ac70995f6df` |
| Codex Probe          | `sha256:30fdf0b75425e2652953f7454ac509e8e669da91e968a6e3512856d50ad8525b` |
| Host Artifact        | `sha256:4a3fe6b941a5559bc5c3caaaa9eac332764eb61957705123cb8ba4f972f33d99` |
| Contract Artifact    | `sha256:95bb0af0f6d3e6fcd3cbcb5e9917fcab5bab674ae7152f7314b726bd8b9d924b` |
| Compatibility Policy | `sha256:fce6f3fedb56d500cbd1a8de25ee905bd6a017e2b2281e0d5d0dcedde46f6661` |
| Compatibility Matrix | `sha256:4ba3502a414e3f745317376756dc28ad4b31495f7f3b33a8281c5d26462e6548` |

Host Result 的验证时间为 `2026-07-16T04:47:33.509Z`。内容寻址 Store 位于维护者专属 OS 用户目录；原始 Prepare、Activation 和 Host Result 包含本机绝对路径，因此不提交为跨机器发布 Artifact。

## 4. Host 执行路径

1. `prepare` 从当前包执行真实 `npm pack`，安装独立 Consumer，创建普通 detached Clone，并生成 Prepare v5 与 Activation Plan v2。
2. Windows Store 应用目录中的 Codex 可执行文件拒绝自动化子进程启动，因此改用 OpenAI 官方 npm 包 `@openai/codex@0.144.5` 的同版本原生 Windows CLI。该路径不是模拟 Host。
3. 在隔离 `CODEX_HOME` 和临时 Worktree 内写入精确 Project Trust、候选 `hooks.json` 与 Hook Binding，不修改日常 Codex Home。
4. 在 Human 已显式授权本次隔离验收的前提下，通过同版本 Codex App Server 的 `hooks/list` 读取两个 Hook 的当前 Hash，再通过 `config/batchWrite` 写入精确信任状态；随后在同一 TUI 中执行 `/hooks` 审阅。全程未使用 Hook Trust bypass 或 `danger-full-access`。
5. 使用开源 `node-pty` 的 Windows ConPTY 驱动同一个交互式 TUI，先完成 Write Set 内的单次 `functions.exec -> tools.apply_patch`，再完成 Write Set 外的单次拒绝；Codex 原生正向文件编辑确认单独执行，负向不得进入编辑确认。
6. 独立运行 `verify-result`、Compatibility Compile 和 Query，避免以 UI 文案、模型自述或退出码代替 Harness 审计证据。

`node-pty` 与 Xterm Headless 只用于维护者本次临时 TUI 自动化，没有加入 `liushi-harness` 的生产依赖。

## 5. 声明边界

- 当前精确 Scope 可以声明 `compatible`，不可以外推到其他 Codex 版本、其他 OS、Codex Desktop/App Server Host、Claude-compatible 或 CatPaw。
- Production Tier 仍缺少 `production_e2e`、`model_id` 和 `permission_mode`；Tarball 有内容摘要，但没有发布 Attestation，因此 `production.satisfied=false` 是正确结果。
- 本记录与本机内容寻址 Store 证明一次真实维护者验收已经完成，但尚未形成由签名发布清单或 Human Approval 绑定的跨机器 Matrix 身份。
- Programmatic Hook Trust 只在显式 Human 授权且精确 Hash 已由 Codex 自身返回时使用；标准项目接入仍保留 Project Trust、Hook Definition Trust 和风险操作 Human Gate。

## 6. 后续主线

1. 确定性 Publication Bundle、create-only 原子输出 CLI 与 P3a G6 Release Attestation Draft 已实现；下一步以 Sigstore Signing/Verification Adapter 形成受信发布者声明。
2. 让 Trusted Release Manifest 与安装选择器只消费精确受信 Matrix Digest，不读取“最新”本地记录，也不把仓库可写 Fixture 当作信任锚。
3. 增加 ProductionE2E、模型与权限 Scope、Tarball Attestation 后，再评估是否满足 Production Tier。
4. 完成 Codex 发布链后进入 Claude-compatible/CatPaw Adapter，不把本次 Codex 结论横向复制。
