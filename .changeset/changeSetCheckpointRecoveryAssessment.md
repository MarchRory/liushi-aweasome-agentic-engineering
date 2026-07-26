---
"liushi-harness": minor
---

新增 ChangeSet-bound Checkpoint 只读恢复评估端口：以 `Absent`、`Present`、`Unknown` 严格区分现场状态，只有完整复验通过时才返回 Checkpoint，并保证评估过程不触发 Git 副作用。
