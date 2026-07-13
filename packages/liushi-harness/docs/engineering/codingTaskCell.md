# CodingTask 纵向 Cell

## 边界

`cell run` 是 CodingTask 编码阶段的确定性编排入口，不是自主 Agent，也不是完整 RequirementWorkflow Runtime。它不会读取 PRD、生成技术方案、替 Human 批准风险、创建 PR、推送、合并或部署。

进入 Cell 前，上游 Task 必须已经提交并通过精确的 PlanRisk Gate；涉及历史业务逻辑时，还必须存在有效的 G2 Human Approval。Cell 继续使用默认权威授权解析器复算这些条件，Manifest 中的授权声明不能绕过 Gate。

## 命令

```powershell
liushi-harness cell run --file codingTaskCell.json --store .liushi/runtime --json
```

Manifest 使用严格版本 `coding-task.cell.run.v2`，按固定顺序包含：

1. `createCommand`：创建 CodingTask。
2. `provision`：创建受管 Worktree。
3. `startAttemptCommand`：开始当前 Attempt。
4. `implementations`：一个或多个受控文件变更。
5. `submission`：创建单一 Git Checkpoint 并原子提交实现结果。
6. `verification`：提交不含 `targetRevision` 的 Verification Plan Template，并声明 `latest_implementation_checkpoint` Binding；Cell 从权威 CodingTask Aggregate 读取 Submission 生成的 Revision，重算最终 Command Digest 后执行验证并提交 EvidenceBundle。

每个步骤复用已有版本化 Command Envelope。所有命令必须绑定同一 `aggregateId` 和 `correlationId`，`commandId` 不能重复；Repository Root 和 Worktree Root 只作为 Runtime Binding 传入，不写入 Receipt、Action Journal 或 EvidenceBundle。

## 停止与恢复

- `committed` 和 `duplicate` Receipt 允许进入下一阶段。
- `rejected` 或 `conflict` 立即返回 `blocked`，后续阶段零调用。
- `outcome_unknown` 立即返回 `outcome_unknown`，禁止自动重试。
- Verification Evidence 只有 `passed` 才进入 PR-ready 装配；`failed` 或 `blocked` 不得调用装配器。
- PR-ready 装配会从权威 Store 重读 CodingTask、Evidence 和来源 Task，并重算当前 Human Gate；任一步不匹配都会停在 `pr_ready`，不得宣称可评审。
- 同一 Manifest 可以在新进程重新执行。Application Command Gateway 会复用已有 Receipt，因此不会重复 Git、文件或 Verification 副作用。

发生未知 Worktree Provision 时，先使用恢复评估和 Human 命令闭合原 Action；不得通过修改 Manifest 或更换 Command ID 旁路 Guard。

## 生产使用步骤

1. Human 与产品、研发确认需求、历史逻辑和风险，并完成必要 Gate。
2. Agent 根据已批准 Artifact、Write Set、Rules 与测试计划生成 Cell Manifest。
3. Human 审阅高风险变更和 Runtime Root 后执行 `cell run`。
4. `blocked` 时读取停止阶段与 Receipt，补充 Human 决策或修复确定性前置条件。
5. `review_ready` 后由 Human 审查 PRReadyArtifact、Checkpoint、Evidence 和代码差异，再决定是否创建 PR。

当前真实 Git E2E 已验证 G1/G4 Human Approval、默认 Task-backed 授权、Checkpoint 后权威绑定 Verification Target Revision、Local Command Verification、Evidence Passed、PRReadyArtifact 和跨 Application 实例幂等复用。公开项目安装 Smoke 和 Human Touch Time 指标仍是下一阶段完成门。
