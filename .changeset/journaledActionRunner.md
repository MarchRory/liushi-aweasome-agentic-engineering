---
"liushi-harness": minor
---

新增带 Action 级跨进程执行锁的 Intent-first JournaledActionRunner。Runner 仅在新 Intent 或明确 `retry_permitted` 时调用 Executor，完成态幂等复用，`intent_recorded` 禁止自动重放，已有 Observation 可以确定性补写 Resolution；执行后 Journal 无法闭合时返回 `action_journal_commit_outcome_unknown`。
