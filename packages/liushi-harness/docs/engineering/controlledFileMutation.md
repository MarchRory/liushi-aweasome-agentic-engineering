# 受控文件写入

## 作用边界

`implementation.apply_files` 是 CodingTask 实现阶段的单个写入 Action，不等同于完整 Coding Attempt。一个 Attempt 可以包含多次写入；只有 Agent 明确完成实现后，独立的 CodingTask Command 才能收口 Attempt 并请求 Verification。

当前命令按以下顺序执行：

1. 校验 Command、Payload Digest 和本机路径联合摘要。
2. 回读 CodingTask 与上游 Task，重新计算 PlanRisk、历史业务逻辑和 Human Gate 授权。
3. 要求目标路径精确属于已确认 Write Set。
4. 获取 Repository Lock，持久化 FileMutation Action Intent。
5. 要求真实 Worktree 在 Action 开始时洁净且版本、分支符合 CodingTask 绑定。
6. 校验所有目标文件、父目录、当前内容摘要和目标内容摘要。
7. 使用临时文件、`fsync` 和原子替换写入完整 UTF-8 文本。
8. 使用 Git Worktree Inspector 验收实际 Changed Paths 与本次 Mutation 集合完全一致。
9. 持久化 Observation 与 Resolution，由 Gateway 生成稳定 Receipt。

## 当前限制

- 只开放 `Create` 和 `Replace`；删除、移动、重命名仍属于风险操作，不自动执行。
- Replace 必须携带当前完整文本摘要，防止覆盖 Human 或其他 Agent 的并发修改。
- 当前采用完整目标文本，不解析或信任模型生成的 Patch 语义。
- 父目录逐段拒绝符号链接，防止通过文件系统重定向逃逸 Worktree。
- Worktree 非洁净、部分写入、后置检查不一致或提交结果未知时进入 `OutcomeUnknown`，不得自动重试。
- 本切片不负责模型调用、Agent 选择、Attempt 收口、验证计划生成或 PR 创建。

历史业务逻辑变更仍必须在上游 PlanRisk 和 G2 Human Gate 中确认业务语义及改动方案；受控写入命令只消费授权，不自行降低 Gate。
