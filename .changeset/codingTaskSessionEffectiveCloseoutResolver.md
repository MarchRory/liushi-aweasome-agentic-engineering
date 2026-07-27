---
"liushi-harness": minor
---

新增 CodingTask Session Effective Closeout Resolver：优先投影原 Closeout Checkpoint，并只在原终态与 Recovery Checkpoint 的身份、版本、完整 State Digest、Snapshot、ChangeSet 和路径绑定全部一致时返回恢复结果；缺失、活动状态与漂移使用稳定 unresolved 原因，存储或摘要异常保持关闭式失败。
