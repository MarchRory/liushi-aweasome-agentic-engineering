---
"liushi-harness": minor
---

为 Session Action Journal v2 增加向后兼容的 Trace 摘要绑定：新 Action Observation 会与唯一创建的完整 Trace Observation 通过 RFC 8785 `observationDigest` 精确绑定，既有未携带该字段的 v2 Journal 仍可读取。Trace Persisted 或 Dropped 时均保留新摘要，并维持 Recovery path digest 的既有语义。
