# ADR-011: Harness 管理跨执行器记忆与晋升

- Status: Accepted
- Date: 2026-07-11

## Context

Codex Memories 和 Claude Auto Memory 都是平台控制的辅助召回。它们的启用状态、生成时间、存储位置、共享边界和可审计能力不同，不能保证企业项目、团队成员和多个执行器获得相同记忆。

把每次 Agent 总结直接追加到单个 Memory 文件会混淆 Task 状态、短期上下文、长期事实和规则，并放大错误总结、Secret 和 Prompt Injection 污染。

## Decision

- Harness 区分 Task State、Working Memory、Learning Candidate、Active Knowledge 和 Platform Assist Memory。
- Event、Artifact 和 Snapshot 是 Task 恢复真源；平台 Transcript/Memory 不能替代。
- AI 只能生成 MemoryCandidate Proposal；确定性 CLI 负责 Evidence、Schema、Digest、去重、脱敏和 Candidate 写入。
- `memory-curator` 根据未来复用价值、Scope、Owner、Evidence 和失效条件建议 Destination。
- Active Knowledge、Rule、Skill、Instruction 和 AgentDefinition 继续通过 Eval 和 G7 Human Promotion。
- Retrieval 先确定性计算 Eligibility，再进行 Lexical Ranking；可选语义 Rerank 不能扩大授权集合。
- 平台 Memory 默认 `assist_only`，其中的 Claim 必须重新取得 Evidence。
- 首月不进行 Codex/Claude Platform Memory 双向同步。

完整契约见 [Memory Runtime](../18-memory-runtime-and-curation.md)。

## Consequences

- Task 可以跨 Session、Compact 和 Executor 按正式状态恢复。
- 长期知识增长较慢，但每条内容可追溯、可失效、可回滚。
- 需要维护 Candidate Queue、Retrieval Index、Retention 和 Secret Scan。
- 平台记忆仍可改善个人体验，但不会静默改变团队交付保证。
