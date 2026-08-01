---
"liushi-harness": patch
---

公开 Session Completion 输入解析契约，并为仓库内 Codex Agent Pilot 增加可重放的 Completion 与 Metrics Settlement 薄编排。Human 只提交无摘要的原始 Metrics Facts；身份、Checkpoint、Verification、PR-ready 与 Evidence 摘要均从权威状态重建，失败时不推进 Pilot 状态。
