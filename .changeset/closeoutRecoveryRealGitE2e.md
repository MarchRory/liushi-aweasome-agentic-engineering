---
"liushi-harness": patch
---

补齐 Human-gated Closeout Recovery 的真实 Git E2E，验证 `RetryOnce` 只创建一个 Checkpoint，`BindExisting` 不重复提交，精确命令重放保持零新增副作用。
