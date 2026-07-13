---
"liushi-harness": minor
---

要求 `cell run` 显式提供 Workspace、Repository、绝对 Repository Root 与 Verification Mode，并由生产 Bootstrap 配置真实 Composition Root。

在任何 Cell 副作用前校验 Manifest 的 Create 身份、全部 Repository Runtime Root 与受管 Verification Worktree Root；无绑定 Cell 调用关闭式拒绝，Local Command 仅可显式启用，Human Gate 保持权威重算。
