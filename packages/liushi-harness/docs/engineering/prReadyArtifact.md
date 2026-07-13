# PRReadyArtifact 权威装配

## 边界

`PRReadyArtifact` 是单个 Repository 达到人工评审资格的确定性交付产物，不是新的 Aggregate，也不创建、推送或合并 PR。它只能总结已有权威事实，不能由 Agent 或调用方补写“已验证”“无风险”或“依赖安全”等结论。

## 权威输入

公开用例只接受 `workspaceId`、`codingTaskId` 和 `verificationRunId` 三个定位字段。装配器内部必须：

1. 从 `CodingTaskRepository` 重放已完成 CodingTask。
2. 从 `EvidenceBundleStore` 强一致读取不可变 EvidenceBundle。
3. 使用 `CodingTaskExecutionAuthorizationResolver` 重算当前 Task-backed Human Gate 和 Write Set。
4. 从来源 `TaskRepository` 读取精确 PlanRisk；涉及历史业务逻辑时同时校验 Business Logic Artifact。

调用方提供完整 Evidence、Head Revision、Changed Paths、风险或回滚方案会被严格输入校验拒绝。

## 交付绑定

Artifact 固定绑定：

- Workspace、Repository、CodingTask 和来源 Task。
- Base/Head Revision、Worktree、Branch、Write Set 和 Changed Paths。
- 由 Base、Head 与 Changed Paths 计算的 Diff Digest。
- InputBindingSet、Verification Plan/Evidence Digest 和精确 Human Gate Authorization。
- PlanRisk 中的全部剩余风险、风险操作和回滚方案。
- 依赖评估状态；当前未执行 Import Graph 时固定为 `not_assessed`，不得暗示安全。

Artifact Digest 对不含自身 ID 和 Digest 的完整正文计算，Artifact ID 再由该 Digest 确定性派生。相同权威状态在新 Application 实例中必须生成完全相同的 Artifact。

## Cell 完成条件

`cell run` 只有同时满足以下条件才返回 `review_ready`：

1. 所有版本化命令 Receipt 为 `committed` 或 `duplicate`。
2. 权威 EvidenceBundle 状态为 `passed`。
3. CodingTask 最新 Attempt、Target Revision 和 Evidence 完全绑定。
4. 当前 PlanRisk、必要的 G2/G4 Approval、Write Set 与来源 Artifact 仍然有效。
5. PRReadyArtifact 成功装配。

任一条件失败都会关闭式停止。Human 仍需审查 Artifact、代码差异和 Evidence 后决定是否创建 PR。

## 当前验证边界

真实 Git E2E 已覆盖 G1/G4 Human Approval、默认 Task-backed 授权、文件变更、单一 Checkpoint、Checkpoint 后权威解析 Verification Target Revision、Local Command Verification、Artifact 装配和跨 Application 实例零重复副作用。公开项目 tarball 安装 Smoke、多仓依赖传播和 Human Touch Time 采集尚未完成。
