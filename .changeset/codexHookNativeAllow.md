---
"liushi-harness": patch
---

修正 Codex PreToolUse 原样放行的原生响应：成功时退出 0 且不写 stdout，避免输出缺少 `updatedInput` 的 `permissionDecision=allow` 而被 Host 判为 Hook 失败。
