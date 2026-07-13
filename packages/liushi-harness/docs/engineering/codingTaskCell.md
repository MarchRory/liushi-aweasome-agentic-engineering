# CodingTask 纵向 Cell

## 边界

`cell run` 是 CodingTask 编码阶段的确定性编排入口，不是自主 Agent，也不是完整 RequirementWorkflow Runtime。它不会读取 PRD、生成技术方案、替 Human 批准风险、创建 PR、推送、合并或部署。

进入 Cell 前，上游 Task 必须已经提交并通过精确的 PlanRisk Gate；涉及历史业务逻辑时，还必须存在有效的 G2 Human Approval。Cell 继续使用默认权威授权解析器复算这些条件，Manifest 中的授权声明不能绕过 Gate。

## 命令

```powershell
liushi-harness cell run --file codingTaskCell.json --workspace workspace-1 --repository repository-1 --root C:\absolute\repository --verification-mode local_command --store .liushi/runtime --json
```

`--workspace`、`--repository`、`--root` 与 `--verification-mode` 均为生产 CLI 必填项。Verification Mode 只接受 `fail_closed_mock` 或 `local_command`；本地命令绝不默认启用。应用可以在没有 Cell Runtime Binding 时创建，以服务其他命令，但执行 Cell 必须显式提供绑定。

Manifest 使用严格版本 `coding-task.cell.run.v2`，按固定顺序包含：

1. `createCommand`：创建 CodingTask。
2. `provision`：创建受管 Worktree。
3. `startAttemptCommand`：开始当前 Attempt。
4. `implementations`：一个或多个受控文件变更。
5. `submission`：创建单一 Git Checkpoint 并原子提交实现结果。
6. `verification`：提交不含 `targetRevision` 的 Verification Plan Template，并声明 `latest_implementation_checkpoint` Binding；Cell 从权威 CodingTask Aggregate 读取 Submission 生成的 Revision，重算最终 Command Digest 后执行验证并提交 EvidenceBundle。

每个步骤复用已有版本化 Command Envelope。所有命令必须绑定同一 `aggregateId` 和 `correlationId`，`commandId` 不能重复；Repository Root 和 Worktree Root 只作为 Runtime Binding 传入，不写入 Receipt、Action Journal 或 EvidenceBundle。

Cell 会在任何命令、存储、文件或 Git 副作用前严格解析 `createCommand.payload` 并核对其摘要。Payload 的 Workspace/Repository，以及 Provision、全部 Implementation、Submission 的 Repository Root 必须与可信 CLI 启动绑定精确一致；Verification Worktree Root 必须等于从该 Repository Root 和已解析受管 `worktreeBinding.relativePath` 唯一推导出的规范绝对路径，不能替换为同 Revision 或同 Branch 的其他 Checkout。缺少绑定或任一不匹配都会关闭式阻断，后续服务零调用。该校验只建立运行时身份边界，不信任 Manifest 自报的 `ExecutionAuthorization`，也不改变 Human Gate。

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
3. Human 审阅高风险变更和 Runtime Root，显式选择 Verification Mode 后执行 `cell run`。
4. `blocked` 时读取停止阶段与 Receipt，补充 Human 决策或修复确定性前置条件。
5. `review_ready` 后由 Human 审查 PRReadyArtifact、Checkpoint、Evidence 和代码差异，再决定是否创建 PR。

当前真实 Git E2E 已验证生产 CLI 启动配置到真实 Composition Root 的 Local Command 映射、G1/G4 Human Approval、默认 Task-backed 授权、Checkpoint 后权威绑定 Verification Target Revision、Evidence Passed、PRReadyArtifact 和跨 Application 实例幂等复用；单元测试覆盖必填参数、未知模式与副作用前绑定拒绝。公开项目安装 Smoke 和 Human Touch Time 指标仍是下一阶段完成门。
