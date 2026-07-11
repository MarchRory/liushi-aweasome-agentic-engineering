# ADR-003: 通用核心与平台适配器分离

- Status: Accepted
- Date: 2026-07-11

## Context

Codex、Claude Code 和企业 Claude-compatible 工具提供不同的 Hooks、Agent、配置、模型和权限能力。直接以某个平台配置作为工作流核心会形成厂商锁定，并产生不真实的兼容声明。

## Decision

Task State、Artifact、Policy、Gate、Store 和 Metrics 保持平台无关。Adapter 负责能力探测、配置渲染、Role 启动和 Proposal 转换。缺失能力必须显式报告或降级，不能伪装等价。

Codex 是首月生产路径；Claude-compatible/CatPaw 是必须通过真实 Smoke Test 的兼容路径，但未通过负向测试前不宣称能力对等。

## Consequences

- 核心可以复用，平台能力仍能深度利用。
- Adapter 必须维护能力矩阵和兼容测试。
- 某些平台专属能力只能作为增强，不能成为 Hard Invariant 的唯一实现。
