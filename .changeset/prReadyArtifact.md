---
"liushi-harness": minor
---

新增单仓 PRReadyArtifact 权威装配：只接受 Evidence Locator，从强一致 Store 重读 CodingTask、Evidence 与来源 Task，重新执行 Task-backed Human Gate 和 Write Set 校验，并确定性绑定 Revision、Diff、Verification、剩余风险与回滚方案。

`cell run` 现在只有在 Passed Evidence 和 PRReadyArtifact 全部闭合后才返回 `review_ready`；真实 Git E2E 覆盖 G1/G4 Human Approval、默认授权解析、跨 Application 实例确定性和零重复副作用。
