---
"liushi-harness": minor
---

为 Codex Executor Compatibility Compile 接入固定五 Case v2 Contract Suite、生产 Hook Input Reader 与独立 Contract Artifact，把公开成功输出从单项 `evidencePersistence` 迁移为按 Host、Contract 排序的 `evidencePersistences`。Compile 与 Query 共用 exact-schema Projection Set Verifier，在任何持久化前校验父 Host Digest、Scope 和观察锚点，并只消费复验返回值。Host 7 条与 Contract 5 条 Evidence 全部 Passed 时编译为 Compatible，Contract Check 的有效 Failed Evidence 编译为 Unsupported；当前没有 ProductionE2e、`modelId`、`permissionMode` 或 Tarball Attestation，不形成 Production 声明。
