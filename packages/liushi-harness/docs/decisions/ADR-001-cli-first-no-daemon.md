# ADR-001: CLI-first，首月不引入 Daemon

- Status: Accepted
- Date: 2026-07-11

## Context

Harness 需要在个人环境和企业项目中快速安装，支持 Codex 和 Claude-compatible 执行器，并且可以安全停止、升级和卸载。常驻服务会增加端口、权限、进程管理、认证和运维成本。

## Decision

首月使用 TypeScript CLI 和本地文件存储。所有动作由显式 CLI、执行器 Hook、Skill 或 CI 调用，不运行后台 Daemon，不开放网络端口。

## Consequences

- 企业接入和故障隔离更简单。
- 长任务连续性依赖持久化状态，而不是常驻进程。
- 定时任务交给现有执行器、CI 或系统调度。
- 未来引入服务端控制面需要新 ADR，不能改变本地 CLI 的可用性。
