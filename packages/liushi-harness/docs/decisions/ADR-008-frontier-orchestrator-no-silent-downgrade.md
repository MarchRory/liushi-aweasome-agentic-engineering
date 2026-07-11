# ADR-008: 顶层 Frontier Orchestrator 不静默降级

- Status: Accepted
- Date: 2026-07-11

## Context

顶层 Orchestrator 负责 Requirement Battle、风险路由、Human 决策和端到端实现。模型降级会同时影响多个 Gate，而且 Human 通常无法从最终文本发现实际模型变化。

## Decision

Orchestrator 始终使用经过 Eval 的当前 Frontier/SOTA 模型，并记录实际 Resolved Model。Frontier 不可用或实际模型不匹配时 Task 进入 `WAITING_HUMAN`，禁止自动切换 Balanced Model。子角色只有在 Policy 明确允许且候选通过角色级 Eval 时可以回退。

Claude 系列模型进入默认 Deny Policy；当前 OpenAI 初始映射由 Model Policy 管理，不永久硬编码在 Skill Prompt 中。

## Consequences

- 顶层质量和模型身份对 Human 可见。
- Frontier 中断会降低可用性，但不会以隐藏质量退化换取继续运行。
- 模型更新需要 Regression Eval 和 Human Promotion。
- 子任务仍可通过经过验证的 Balanced/Fast Route 控制延迟和成本。
