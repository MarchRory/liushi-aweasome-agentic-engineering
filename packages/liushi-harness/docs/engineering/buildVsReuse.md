# Build vs Reuse 决策

## 判定口径

本文只记录当前仓库能够证明的实现状态，不把路线图、设计文档或依赖候选写成生产能力。

- **已使用**：依赖已锁定，并且当前源码或测试存在直接调用。
- **自研保留**：语义属于 Harness 的可信核心，不能交给第三方框架定义。
- **候选 / 未实现**：当前包清单与锁文件没有直接依赖，或仓库只有设计意图而没有可运行 Adapter；这不代表已选型、已集成或已获生产支持。
- **许可证待核验**：本仓 `pnpm-lock.yaml` 锁定了版本与完整性，但没有记录这些第三方组件的许可证字段。发布或引入前必须依据锁定版本补齐许可证审查和 Notice；不得用常识推断许可证。

## 决策原则

Domain、Gate、Action Journal、Evidence 和 `outcome_unknown` 是 Harness 自持语义。它们必须保持确定性、可重放、可审计，并在副作用结果无法确认时 fail closed。外部库、编排器、Agent Runtime、可观测后端、Skill、MCP 或知识系统都不能成为这些语义的真源。

复用候选只能经 Application Port 和 Infrastructure/Platform Adapter 接入。Adapter 负责能力探测、协议转换、超时与错误归一化；Core 负责授权、Gate 重算、Journal 提交、Evidence 接纳和未知结果判定。候选通过 conformance fixture、失败恢复、许可证与供应链审查之前，不得标记为生产支持。

## 当前决策表

| 能力 / 组件                        | 当前状态                 | Build vs Reuse 决策 | 当前证据与边界                                                                                                                                                                                            | 许可证                    |
| ---------------------------------- | ------------------------ | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Domain / Gate                      | 自研保留                 | Build               | Domain Aggregate、Policy 和 Human Gate 由 Core 确定性重算；第三方只能提供外围执行能力，不能改变状态机、授权或不可豁免规则。                                                                               | 不适用                    |
| Action Journal / `outcome_unknown` | 自研保留                 | Build               | Intent-first Journal、Observation、Resolution、幂等与未知结果语义由 Core 持有；外部执行失败必须映射回现有结果模型。                                                                                       | 不适用                    |
| Evidence                           | 自研保留                 | Build               | EvidenceBundle 的绑定、持久化和接纳属于可信核心；测试框架、CI 或可观测后端只提供输入，不成为 Evidence 真源。                                                                                              | 不适用                    |
| `minimatch@10.2.5`                 | 已使用                   | Reuse               | 包清单与锁文件固定版本；源码用于 Rule Selector 和 Action Hook Write Set 的确定性路径匹配。                                                                                                                | 待核验                    |
| `write-file-atomic@7.0.1`          | 已使用                   | Reuse               | 包清单与锁文件固定版本；源码用于 Snapshot、Command Reservation、Hook Binding、EvidenceBundle 和 Runtime Health 等原子文件替换。它不替代 Event/Journal 的提交语义。                                        | 待核验                    |
| Sigstore JavaScript                | 已使用                   | Reuse               | 锁定 Node 20 兼容的 `sigstore@4.1.1`、Bundle/Core/Verify/Protobuf 组件；Infrastructure Adapter 负责 DSSE 签名、显式 Trusted Root 离线验证和 DER 证书扩展解析，不定义 G6、Artifact Digest 或安装信任语义。 | Apache-2.0，Notice 已补齐 |
| `Vitest@4.1.10`                    | 已使用（开发期）         | Reuse               | 根工作区锁定测试框架，`liushi-harness` 的测试脚本和测试文件直接使用；它只执行验证，不定义 Gate 或 Evidence 接纳。                                                                                         | 待核验                    |
| 原生 Git CLI                       | 已使用（外部可执行程序） | Reuse               | Worktree、Verification Guard 和 Git Checkpoint Adapter 通过 `CommandRunner` 调用 `git`；Node Runner 使用参数数组与 `shell: false`，没有引入 Git SDK。运行环境可用性仍需探测。                             | 待核验                    |
| Codex App Server / `generate-ts`   | 已使用（外部 Host）      | Reuse + Build       | 复用官方 App Server Transport、Wire Protocol 和版本化 TypeScript Schema；Harness 自持 File Change Allowlist、Human Approval、审计摘要、终止不确定性和 fail-closed 状态机，不把生成类型当作运行时校验。    | 外部组件，发布前核验      |
| `simple-git`                       | 候选 / 未实现            | 暂不引入            | 当前包清单与锁文件无直接依赖。只有在原生 Git Adapter 的跨平台差异无法用小型适配层控制时才重新评估，且必须保持既有 Port、参数安全和未知结果语义。                                                          | 待核验                    |
| LangGraph                          | 候选 / 未实现            | 暂不引入            | 不作为 Workflow 或 Domain 真源。若未来试验，只能实现 Workflow/Executor Port，并通过重放、暂停恢复和失败分类 conformance。                                                                                 | 待核验                    |
| OpenAI Agents SDK                  | 候选 / 未实现            | 暂不引入            | 不作为 Agent、Tool 权限、Gate 或运行状态真源。未来只能经 Agent Runtime Adapter 接入，并接受 Core 的能力、权限和输出契约约束。                                                                             | 待核验                    |
| Temporal                           | 候选 / 未实现            | 暂不引入            | 可作为 Durable Engine 候选，但不能定义 Harness 状态机。接入前必须证明暂停、恢复、幂等、补偿与 `outcome_unknown` 映射符合 Core 契约。                                                                      | 待核验                    |
| Nx / Turborepo                     | 候选 / 未实现            | 暂不引入            | 当前工作区使用 pnpm scripts，没有锁定 Nx 或 Turborepo。只有在任务图或缓存收益可量化且不改变包边界时才评估。                                                                                               | 待核验                    |
| Playwright                         | 候选 / 未实现            | 暂不引入            | 当前包清单与锁文件无直接依赖，也没有浏览器验证 Adapter。未来只能作为 Verification Port 的执行器，产物经现有 Evidence 流程接纳。                                                                           | 待核验                    |
| OTel Exporter                      | 候选 / 未实现            | 暂不引入            | 当前已有 W3C/OTel 标识与本地 Trace Observation，不等于存在 OTel Exporter。Exporter 只能 best-effort 输出 Trace，不能影响业务结果或 Event Replay。                                                         | 待核验                    |
| Langfuse                           | 候选 / 未实现            | 暂不引入            | 可作为 Trace/Eval 后端候选，但当前没有依赖或 Adapter。不得成为 Workflow、Journal、Evidence 或成本事实的权威存储。                                                                                         | 待核验                    |
| Skills / MCP                       | 候选 / 未实现            | 暂不引入            | 当前只有设计范围，没有可运行的完整 Registry、解析、权限与调用闭环。未来必须经 Capability/Connector Port 和平台 Adapter 接入，且不能扩大 Tool 权限。                                                       | 待核验                    |
| 完整 Memory / Wiki                 | 候选 / 未实现            | 暂不引入            | Event、Artifact、Snapshot 和受治理的知识候选仍是边界；当前没有完整检索、压缩、同步或自动晋升闭环。Wiki/Memory 内容只能作为有来源的非可信输入，不能修改 Gate、权限或输出 Schema。                          | 待核验                    |

## 引入候选的最低 Gate

候选进入实现计划前，至少需要同时满足：

1. 明确对应 Port、Adapter、Capability Probe 和 fail-closed 行为，不允许从 Infrastructure 反向渗透 Domain。
2. 使用固定版本补齐许可证、Notice、供应链和运行环境审查。
3. 用 conformance fixture 覆盖成功、拒绝、超时、崩溃、重复调用、恢复和 `outcome_unknown`。
4. 证明不会绕过 Human Gate、Action Journal、EvidenceBundle 或 Application Command Gateway。
5. 在实现状态矩阵与 README 中仍以实际可运行切片为准；实验代码、文档链接和可选后端不得宣传为生产支持。
