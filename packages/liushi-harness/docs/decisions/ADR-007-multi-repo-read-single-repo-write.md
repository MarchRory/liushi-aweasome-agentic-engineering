# ADR-007: 多仓读取，默认单仓写入

- Status: Accepted
- Date: 2026-07-11

## Context

真实企业项目需要 Application、公共 Infra、Contract 和 Wiki 上下文，但跨仓自动写入会引入所有权、锁、部分成功和发布协调风险。

## Decision

WorkspaceGraph 支持多仓读取和影响分析。首月每个 Task 默认只有一个 Write Repository；跨仓写入必须通过独立 Human Gate，并使用非原子 Saga、独立 Worktree 和补偿计划。

## Consequences

- Agent 可以理解公共层和调用关系，而不会因读取依赖自动获得写权限。
- 单仓 Golden Path 可以在一个月内达到可靠生产使用。
- 跨仓任务出现部分成功时必须由 Human 决定后续动作。
- 未来自动化跨仓 PR 或发布需要新的 Evidence 和 ADR。
