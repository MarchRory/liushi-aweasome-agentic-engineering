---
"liushi-harness": minor
---

新增生产 `coding-task session closeout` CLI：读取严格 Command Envelope，复验 Workspace、Repository Root 与 Agent Actor 绑定，并把 Closeout 结果稳定映射为成功、冲突或未知退出码。真实 Git E2E 现已覆盖 Human Gate、Session Activation、Hook Journal/Trace、Action Coverage、唯一 ChangeSet-bound Checkpoint 和跨 Application 零副作用重放。
