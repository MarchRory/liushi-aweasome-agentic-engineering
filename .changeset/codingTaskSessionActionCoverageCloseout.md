---
"liushi-harness": minor
---

将 Session Action Coverage Manifest 升级为 v2，把已复验 Journal v2 Intent.targets 作为冻结且纳入 digest 的证明字段，并在 Closeout State v3 中用 Action targets union 闭合 Snapshot changed-path 覆盖与 Write Set 约束。Rename 覆盖规范化后的源与目标路径，Copy 只覆盖实际新增目标；旧 v1/v2 文件继续经过显式迁移与 Human Gate，拒绝不完整或漂移证据。
