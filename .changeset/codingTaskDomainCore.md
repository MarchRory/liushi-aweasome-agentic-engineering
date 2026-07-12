---
"liushi-harness": minor
---

新增 CodingTask Domain Core：提供单仓 CodingTask Aggregate/Reducer、独立 Aggregate/Event Schema、PlanRisk 与 G2 历史逻辑 Human 授权绑定、Attempt 串行状态机、Verification 结果接纳和 WaitingHuman 的显式 Human Resolution。该切片不包含 CodingTask Store、Command、Worktree、真实 Executor 或 Verification Runner。
