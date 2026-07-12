---
"liushi-harness": minor
---

新增 Workspace/Repository 级 Repository Lock Port、Acquire Use Case 和 Node 文件锁 Adapter。Lock 竞争返回脱敏稳定错误，句柄释放幂等；该能力只提供运行时互斥，不创建 Worktree、不修改 Git、不授予代码写入权限。
