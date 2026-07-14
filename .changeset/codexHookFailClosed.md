---
"liushi-harness": patch
---

兼容 Codex Code Mode Hook 的子 Agent 输入字段，在 PreToolUse/PostToolUse Handler 失败或异常时分别返回结构化 deny/block，并将 Host Smoke Runtime 固定到 workspace-write 可写且被 Git 排除的 Worktree 内目录，避免普通进程失败被宿主按 fail-open 继续执行。
