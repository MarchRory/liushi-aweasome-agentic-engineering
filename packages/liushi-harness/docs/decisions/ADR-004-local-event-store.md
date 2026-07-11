# ADR-004: 本地 Append-only Event Store

- Status: Accepted
- Date: 2026-07-11

## Context

任务需要在聊天中断、上下文压缩和进程崩溃后恢复，同时首月不希望引入数据库和服务运维。

## Decision

用户运行时保存在 `~/.liushi-harness`。每个 Task 使用 Append-only JSONL Events、Action Journal、原子 Snapshot 和 Artifact 文件。团队长期配置和已评审知识保存在仓库 `.liushi-harness` 目录。

## Consequences

- 状态可本地审计、备份和恢复。
- 必须认真实现文件锁、Windows 原子行为和故障注入测试。
- Hash Chain 用于完整性发现，不提供防恶意篡改保证。
- 如果未来迁移 SQLite 或远程 Store，必须保持 Port 和事件语义兼容。
