---
"liushi-harness": minor
---

新增 ChangeSet 与 Git Checkpoint 双向绑定：提交前持久化并复验受管 Worktree Snapshot，提交后从真实 Commit Diff 与目标原始字节独立重建同一 ChangeSet，并生成绑定 Checkpoint、ChangeSet 和 Snapshot 的联合摘要。

提交前漂移保持零 Git 副作用；提交后无法证明绑定时进入 `outcome_unknown`；已存在且完全匹配的 Checkpoint 可幂等恢复，不会创建第二个 Commit。完整 Session Closeout Process Manager、Verification 与 PRReady 编排仍未实现。
