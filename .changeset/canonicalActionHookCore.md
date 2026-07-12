---
"liushi-harness": minor
---

新增 Canonical Action Hook Core：通过版本化 Command Envelope 严格绑定 Hook Payload，使用持久化 Command Gateway 保证幂等，并在 PreAction 阶段依据 PlanRisk Write Set、风险等级和精确 Human Approval 进行 fail-closed 授权。PostAction 会确定性写入 Action Journal 的 Observation 与 Resolution，并记录可丢失 Trace Observation。

该能力仅提供执行器无关的 Core 契约与 Dispatcher；Codex、Claude-compatible 和 CatPaw 的平台 Hook 配置、输入投影与 CLI Wrapper 将由后续 Adapter 提供。

同时修复并发 Command 在 Pending 轮询与 Receipt 提交争用同一文件锁时误报 `outcome_unknown` 的问题；Gateway 现在只重试幂等 Receipt Completion，绝不重复执行 Handler。
