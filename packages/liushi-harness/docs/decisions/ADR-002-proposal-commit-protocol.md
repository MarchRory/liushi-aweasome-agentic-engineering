# ADR-002: AI Proposal 与确定性 Commit 分离

- Status: Accepted
- Date: 2026-07-11

## Context

Agent 擅长需求理解、代码分析和方案判断，但模型输出不稳定，不能直接承担状态一致性、审批和审计写入。

## Decision

所有 Agent 只能输出 `ProposalEnvelope`。只有 `liushi-harness` CLI 可以校验 Schema、Policy、Evidence、Digest 和 Gate，然后提交正式 Artifact、事件和状态。

## Consequences

- 同一套治理逻辑可以跨执行器复用。
- Prompt 或 Skill 失误不会直接改写规范状态。
- Agent 输出必须结构化，增加了 Schema 和适配成本。
- Human 决策必须被转换为 ApprovalRecord，聊天文本不能单独作为授权。
