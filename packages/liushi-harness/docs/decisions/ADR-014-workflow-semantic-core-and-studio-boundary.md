# ADR-014: Workflow 语义内核与 Studio 边界

- Status: Accepted
- Date: 2026-07-12

## Context

现有 `TaskAggregate` 已提供 Artifact、Approval、Gate、Event Replay 和本地恢复，但它同时承载需求、方案、实现与评审。目标产品需要覆盖完整 PRD 到多仓 PR-ready 生命周期、Human 打断、Agent 执行、Context/Memory 和可视化 Studio。

如果直接在现有 Task 外包一层通用 DAG，或同时建设多个强聚合、Durable Engine 和可视化 Builder，会在语义、幂等、迁移和副作用恢复尚未稳定时固化错误边界。

## Decision

- Harness 是工程语义真源，不是通用 DAG、BPMN 或低代码平台。
- 首版只实现 `RequirementWorkflowAggregate` 与 `CodingTaskAggregate` 两个强一致性边界。
- Verification 先作为可恢复执行记录，Repository Delivery 先作为 Process Manager，`PRReadyArtifact` 作为确定性 Gate 产物。
- 所有写入口统一通过版本化 Application Command Gateway；CLI、Studio 和 CI 都是 Adapter。
- Semantic Event、Action Journal、Trace Observation 和 Read Model 职责分离，但共享因果标识。
- 任何结果未知的副作用进入 `outcomeUnknown`，不得自动重试。
- Harness 不推断 Artifact 字段变化的业务影响，只比较显式 `InputBindingSet` 与当前有效 Revision；后续动作由测试或 Human 决定。
- Studio 是独立应用，不保存语义真相；先建设 Tracker 和 Decision Inbox，再建设 Control、Experiment 与 Builder。
- Durable Engine、企业控制面和完整 Studio 技术栈在 conformance fixture 与真实需求数据出现后选型。

## Consequences

- Workflow 开工前必须先交付 Command/Receipt、Golden Replay、Revision Binding、Context Trust、Failure Taxonomy 和 `outcomeUnknown`。
- 现有 V1 Task 不立即重命名或原地迁移；新 Workflow 使用 V2 Event，旧 Store 保持可读。
- 公共 npm API 逐步收敛到 `commands`、`queries`、`contracts` 和 `testing` 子路径。
- 首个 Fixture 可以是单仓，但公共 Contract 保持 Workspace 与多仓语义。
- React Flow、Backstage、OTel、OpenInference、Langfuse、Temporal 等只能通过清晰边界复用，不能反向定义 Harness Domain。
- Studio 的远程写入在真实身份、授权、幂等 Receipt 与冲突处理完成前不得开放。
