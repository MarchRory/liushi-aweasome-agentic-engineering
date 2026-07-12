---
"liushi-harness": minor
---

新增 Managed Worktree Provision Command：通过版本化 Gateway、CodingTask 权威授权、Repository Lock 和 JournaledActionRunner 创建 Git Worktree，并以只读 Inspector 验证分支、基线和 Write Set 后置条件。

Runtime Repository Root 只以摘要绑定 Command，不进入 Receipt、Journal 或 Evidence；明确未产生副作用时允许提交新 Command，失败或部分执行无法判定时固定进入 Human 恢复检查。
