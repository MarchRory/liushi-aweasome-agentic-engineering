---
"liushi-harness": minor
---

新增可信 Repository Root 解析、Git Checkpoint 与版本化实现提交命令，在 Human Gate、Write Set、Repository Lock 和 Action Journal 边界内把当前 Attempt 收口到 Verification，并允许 Human 在 Git/Event 结果未知时接纳已验证的既有 Checkpoint。
