---
"liushi-harness": minor
---

新增 CodingTask Session Activation CLI、不可变 Activation Record/File Repository、Session 级跨进程 Lease 和 Activation Binding，支持 `Create -> Provision -> StartAttempt` 后的权威读取、耐久化 `outcome_unknown` 与跨实例幂等复用。Activation 成功状态 `waiting_agent` 仅是技术检查点，不授予写入权限；CLI 的 Repository Root 与 Actor 只是操作员启动声明，生产宿主必须从 Human 批准配置注入。Session-scoped Hook Binding v2 与 Action Admission 留在 S2，并对未授权或不完整证据保持 fail-closed。
