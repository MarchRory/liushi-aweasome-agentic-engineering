---
"liushi-harness": minor
---

新增强一致 EvidenceBundle Store：按 Workspace、CodingTask 和 Verification Run 隔离不可变文件，支持跨实例读取、幂等复用、同 Run 冲突检测、内容摘要重算和结构篡改阻断。

EvidenceBundle 持久化会重新校验 Check、EvidenceRef、Target Revision、时间和总体状态；原子写入或目录持久化结果不确定时返回独立错误，禁止自动重试。
