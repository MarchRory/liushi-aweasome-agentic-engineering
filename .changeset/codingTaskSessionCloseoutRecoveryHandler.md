---
"liushi-harness": minor
---

新增 CodingTask Session Closeout Recovery Handler 与 Command Service：在 Repository Lock 内执行 fresh reassessment，以 create-only/CAS Recovery State 保证仅本次 Executing Intent winner 至多调用一次 Checkpoint，并对 Executing 重放、Checkpoint 身份漂移及持久化或锁释放未知结果关闭式处理。
