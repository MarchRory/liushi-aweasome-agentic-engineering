---
"liushi-harness": minor
---

新增 Human-gated Worktree Provision 未知状态恢复：从可信 Repository Root 只读评估路径、Git Worktree Registry、分支、HEAD/Base 与工作区状态，并要求 Human 提交精确 Assessment Digest 后才闭合原 Action Journal。

恢复命令不执行任何 Git 写入、删除、重建或自动重试；现场漂移、脏工作区、Registry 冲突和不可用证据固定 fail closed。
