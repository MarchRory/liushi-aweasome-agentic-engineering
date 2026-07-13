---
"liushi-harness": minor
---

新增未闭合 Worktree Provision 下游执行守卫：Provision、受控文件变更、Implementation Submission 与 Verification 会在 Repository Lock 内、创建新 Intent 或执行副作用前检查可恢复 Action Journal。

未知结果和等待 Human 的 Provision 固定 fail closed；只有原 `retry_permitted` Provision Action 可以再次执行，其他命令不能旁路未闭合状态。
