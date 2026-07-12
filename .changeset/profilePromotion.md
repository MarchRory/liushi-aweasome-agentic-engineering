---
"liushi-harness": minor
---

新增 Human-gated ProjectProfile Promotion 纵向链路：严格解析多仓 Project Discovery Report，通过 `ProjectProfileProposal` 和不可豁免 G8 绑定 Human 决策，并使用 `profile compile` 确定性生成带审批来源的 ProjectProfile Bundle 与 Active ProjectRuleCatalog。

编译过程会重新校验 Workspace、Task、Artifact Revision、Report、Candidate、Rule、Architecture Mechanism 和内容摘要；跨域审批、旧 Revision Approval、重复身份和 Revision Drift 均 fail closed。Scanner 生成的 Rule ID 包含 Repository 身份，避免多仓 Catalog 碰撞。
