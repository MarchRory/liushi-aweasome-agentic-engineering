---
"liushi-harness": minor
---

新增 VerificationPlan/Check 严格校验、Verification Executor/Runner Port、串行验证用例、Required/Conditional/Advisory 状态聚合和不携带原始输出的 EvidenceBundle 装配。默认 Mock Executor 不执行命令，未配置的 Check 固定返回 `Blocked`，为后续真实 Verification Runner 保留可替换边界。
