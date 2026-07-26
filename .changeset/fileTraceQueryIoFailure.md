---
"liushi-harness": patch
---

修复 File Trace Observation 查询在 Task 路径检查发生非 `ENOENT` 文件系统异常时直接拒绝 Promise 的问题。查询现在通过 `Result` 返回 `IoFailure`，真实缺失的 Task 仍返回 `TaskNotFound`，从而保持 Trace Store 的关闭式错误契约。
