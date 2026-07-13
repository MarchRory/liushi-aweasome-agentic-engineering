---
"liushi-harness": patch
---

修复受控文件写入的根目录绑定和提交后验收：实际写入根现在只能由 Repository Root 与受管 Worktree Binding 推导，调用方不能独立指定写入目录。

Replace 在写入前再次校验当前摘要并保留文件 mode；写入后回读实际内容计算摘要、同步父目录。写入或清理结果无法证明时固定进入 OutcomeUnknown，不再声明可安全重试。
