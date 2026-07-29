---
"liushi-harness": patch
---

增加受 Human Gate 约束的 Codex Agent Pilot Host Preview 与单次 Agent Runner。固定版 Codex 通过禁用 WebSocket 的 `app-server` JSONL 协议运行，Harness 使用 FileChange Approval、隔离 Runtime、精确写集和零真实模型双场景预检生成 Host 审批证据；原生 Hook 仅保留兼容性声明，不承担生产控制。Pilot 状态与执行记录同时覆盖原子发布、稳定幂等键、并发收敛、进程结果未知和崩溃重放。
