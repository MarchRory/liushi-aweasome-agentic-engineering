---
"liushi-harness": minor
---

新增 CodingTask Session-bound Action Admission：Activation 自动创建 Session Hook Binding v2 与 Admission State，Codex Pre/Post 在 Session Lease 下复验权威身份、PlanRisk、Human Gate 和 Write Set，并以 v2 Intent、v2 Observation、受其因果绑定的 Resolution 与 Trace 形成可恢复因果链。缺失 Post、未闭合 Human/Retry 状态、锁竞争及跨 Store 提交未知均保持 fail-closed；Windows 目录耐久性只对精确 `win32 + EPERM + fsync` 提供平台等价判定，其他 best-effort 结果继续降级。完整 Closeout 与真实 Codex Pilot 仍未包含。
