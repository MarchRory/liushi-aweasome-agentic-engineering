# ADR-012: Canonical Agent Registry 与 Adapter 渲染

- Status: Accepted
- Date: 2026-07-11

## Context

仅定义 Context Scout、Risk Reviewer 和 Verifier 等角色名称，无法回答模型、权限、Tool、Skill、Context、Memory、输出 Schema 和失败策略。直接以 `.codex/agents/*.toml` 或 `.claude/agents/*.md` 为真源会把 Core Workflow 绑定到单一平台。

动态创建没有 Contract 的 Agent 还会导致越权、上下文污染、不可重复 Eval 和无法解释的模型降级。

## Decision

- Harness 使用版本化 `AgentDefinition` 和 Agent Registry 作为 Canonical Source。
- AgentDefinition 绑定 Role、ModelPolicy、Permission、Tool/Connector、Skill、ContextPolicy、MemoryAccess、Output Schema、Gate 和 Eval Suite。
- Resolver 根据 Task Risk、Artifact、Executor Capability 和 Policy 生成不可变 AgentInstance Digest。
- Adapter 确定性生成 Codex TOML、Claude-compatible Agent/Settings 或 Generic RoleInvocation。
- Orchestrator 是主 Session，首月不作为递归 Subagent；最大 Agent 深度为 1。
- 只读角色不能写项目或 Active Store；Learning Curator 只能生成 Candidate Proposal。
- Platform Override 只表达无法规范化的平台差异，不能覆盖 Permission、Gate、MemoryAccess 和 Output Schema。
- Agent/Prompt/Model/Skill/Permission 变化必须形成 Candidate Version，经过 Regression Eval 和 G7 Promotion。

完整契约见 [Agent Registry](../19-agent-registry-and-platform-rendering.md)。

## Consequences

- Codex、Claude-compatible 和 Generic 路径可以共享角色保证与 Eval。
- Adapter 需要维护 Renderer、Capability Probe 和平台 Contract Fixture。
- 无法证明隔离或权限的执行器会降级 Manual/Assisted，减少表面兼容范围。
- Agent 配置更新成本增加，但权限、模型和上下文变化可以被审计和回滚。
