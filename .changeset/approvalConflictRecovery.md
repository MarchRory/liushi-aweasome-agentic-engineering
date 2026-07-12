---
"liushi-harness": patch
---

修复 Human Approval 在短暂 Task Lock 或 Version Conflict 后只轮询重复结果、无法恢复原请求的问题。冲突恢复现在使用有限预算重跑完整审批协议，并覆盖持锁超过旧 250ms 窗口的回归场景。
