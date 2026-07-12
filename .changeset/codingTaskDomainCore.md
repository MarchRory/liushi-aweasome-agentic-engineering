---
"liushi-harness": minor
---

新增 CodingTask 编码 Cell 的可恢复持久化与命令入口：提供严格 Event Schema、append-only File Store、Hash Chain、Locator 身份校验、候选 Replay、Versioned Command Gateway、Attempt/Verification/Human Command Service，以及默认从上游 Task Replay 重算 PlanRisk、Business Logic G2、Approval 和 Write Set 的权威授权解析。Worktree、Verification Runner、EvidenceBundle 和真实 Executor 仍属于后续切片。
