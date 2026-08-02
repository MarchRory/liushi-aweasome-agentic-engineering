---
"liushi-harness": minor
---

新增已批准 Requirement 到 PlanRisk 的 Human Review 主线：Codex 以只读模式生成 Business Logic 或 PlanRisk 候选，历史逻辑变更必须先完成 G2，R1-R3 必须由 Human 确认，R2/R3 在确认内完成 G4，R4 关闭式拒绝。

CLI 新增 `plan-risk analyze` 与 `plan-risk confirm`，Human 无需输入 Artifact 或 DecisionRequest Digest。Core 拒绝 Agent 直接提交 Business Logic/PlanRisk；Human 手工提交完整 Proposal 继续作为高级显式确认路径并执行既有 Gate Policy。Codex Structured Output 同步限制单轮 Business Logic 问题数，并继续由 Application 进行领域复验。
