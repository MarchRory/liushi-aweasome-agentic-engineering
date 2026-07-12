---
"liushi-harness": minor
---

新增版本化受控文件写入命令：Agent 提交完整目标文本后，Harness 在 Human 已确认的 Write Set、权威授权、仓库锁和 Action Journal 边界内应用 Create/Replace，并使用真实 Git Worktree Inspector 验收实际 Diff。

Replace 必须绑定当前内容摘要；运行时路径漂移、历史内容漂移、路径越界和符号链接路径均 fail closed。无法证明副作用结果时进入 OutcomeUnknown，等待 Human 恢复，不自动重试。
