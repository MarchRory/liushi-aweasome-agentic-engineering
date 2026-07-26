---
"liushi-harness": minor
---

新增 CodingTask Session 权威 ChangeSet 与只读 Git ChangeSet Inspector：分别计算可跨 Checkpoint 复验的变更内容摘要，以及绑定 Repository、Worktree、Branch、Base、观测 HEAD 和 Write Set 的现场快照摘要。

Inspector 从真实受管 Worktree 派生路径、变化类型和目标原始字节摘要；空变化、身份漂移、Write Set 越界、未合并或未知状态、符号链接及读取期间变化均关闭式拒绝。该切片不创建 Git Commit、不执行 Verification，也不表示完整 Session Closeout 已完成。
