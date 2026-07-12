---
"liushi-harness": patch
---

新增持久化 Application Command Gateway，以原子 Reservation、独立 Lock、Request Digest 和稳定 Receipt 保证跨进程幂等；并发重复请求只执行一次 Handler，崩溃遗留 Pending 或 Receipt 提交失败时返回 `outcome_unknown`，禁止盲目重试副作用。
