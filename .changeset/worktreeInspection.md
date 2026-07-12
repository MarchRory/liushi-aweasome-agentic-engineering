---
"liushi-harness": minor
---

新增只读 Worktree Inspector：通过 `shell=false` 的 Git Command Runner 检查真实 Worktree Root、分支、HEAD、Base Revision、Git 状态和 canonical Write Set，并以稳定枚举状态返回 Dirty、Base Revision Drift、Branch Mismatch、Write Set Violation 或 Unavailable。

该能力包含 Root containment、Symlink/Junction 越界检查、Rename/Copy 解析、Base Revision 参数注入防护和绝对路径脱敏；不创建、删除、Reset、Checkout、Merge、写入或清理 Worktree。
