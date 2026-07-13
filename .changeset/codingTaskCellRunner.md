---
"liushi-harness": minor
---

新增 `cell run` 纵向 CodingTask 编排命令，按固定顺序复用版本化 CodingTask、Worktree、文件变更、Checkpoint Submission 和 Verification 服务。

Cell 支持多次受控实现、非成功 Receipt 立即停止、Evidence fail closed，以及同一 Manifest 跨进程幂等恢复；Human Gate 与历史业务逻辑授权仍由既有权威解析器强制执行。
