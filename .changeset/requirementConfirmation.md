---
"liushi-harness": patch
---

新增 `requirement confirm`：Human 可直接编辑 `requirement analyze --json` 生成的 `reviewDraft`，回答未决问题并修订需求契约；Harness 在 Application 内部完成幂等 Artifact 与 G1 Approval 绑定，不要求 Human 输入任何摘要。
