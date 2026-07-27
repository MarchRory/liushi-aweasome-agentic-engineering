---
"liushi-harness": minor
---

新增 CodingTask Session Closeout Recovery File Store：通过独立短时锁、create-only 初始化、精确版本 CAS、严格 canonical 重建和 Recovery 专属未知结果分类，持久化 Human-gated 恢复进度且不修改原 Closeout State。
