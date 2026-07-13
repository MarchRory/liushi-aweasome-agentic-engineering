# Worktree Provision 未知状态恢复

## 目标

`worktree.provision.reconcile.v1` 将无法确认结果的 Managed Worktree 创建动作闭合为可审计状态。该能力只读取可信 Repository Root、Git Worktree Registry、目标分支和 Worktree 现场，不执行 `add`、`remove`、`reset`、`checkout`、`prune`、分支删除或任何自动重试。

## 两步协议

1. `assessWorktreeProvisionRecovery` 根据 `workspaceId`、`codingTaskId` 和原 `actionId` 加载权威 CodingTask 与 Action Journal。
2. Repository Root 只从启动期注入的 `RepositoryRootResolverPort` 获取；调用方不能提交本机 Root、Revision、Path 或 Worktree Binding。
3. 专用只读 Inspector 联合检查路径、`git worktree list --porcelain -z`、目标分支以及既有 `WorktreeInspectorPort` 报告。
4. Assessment 返回脱敏状态、结构化诊断、Journal Sequence 和规范化 Digest，不返回绝对路径、stderr 或原始 Git 输出。
5. Human 检查 Assessment 后，提交携带 `expectedAssessmentDigest` 的版本化 Reconcile Command。
6. Command 在 Repository Lock 和原 Action Execution Lock 内重新评估；Digest 漂移时不写 Journal，Human 必须重新检查。
7. 对账只向原 Action Journal 追加 Observation 与 Resolution，Command Gateway 负责命令幂等和稳定 Receipt。

## 确定性结论

| 现场证据                                                                     | Assessment       | Journal 结果                        |
| ---------------------------------------------------------------------------- | ---------------- | ----------------------------------- |
| 路径、Registry、分支精确一致，且 Worktree Inspector 为 `ready`               | `applied`        | `succeeded -> recovered`            |
| 路径、Registry、分支全部不存在                                               | `not_applied`    | `not_applied -> retry_permitted`    |
| 脏工作区、Write Set 越界、Registry/分支/HEAD/Base 冲突或目标位置存在未知对象 | `human_required` | `outcome_unknown -> human_required` |
| Root、Git 只读命令或既有 Inspector 不可用                                    | `unavailable`    | `outcome_unknown -> human_required` |

只有 `not_applied` 才允许后续受控重试。本命令本身不重试 Provision，也不创建新 Action。`committed`、`recovered` 或 `retry_permitted` 的原 Action 不接受新的 Reconcile Command；同一 Command 的重复调用由 Gateway 直接复用 Receipt。

## Action 身份与恢复边界

恢复前必须证明原 Action：

- 属于当前 Workspace 和 CodingTask 的 `sourceTaskId`。
- `kind` 为 `git_mutation`。
- Target 精确绑定当前 Repository、Worktree ID、相对路径和分支。
- Input Digest 绑定当前可信 Root 与原 Provision Payload。
- Postcondition Digest 和 Base Revision 与当前 CodingTask 一致。
- Worktree Binding 标记为 `managed`。

`intent_recorded`、`awaiting_resolution` 和 `waiting_human` 可以进入恢复。已有 Observation 会先按兼容规则补写 Resolution；若旧的 `not_applied` 与当前现场冲突，则继续追加当前 Assessment，最终状态以新的只读证据闭合。

## 当前限制

- 本切片没有实现 Worktree Cleanup、Rebuild、分支删除、强制清理或多仓补偿 Saga。
- CodingTask 尚未持有独立 Worktree 生命周期状态。
- 其他实现、提交和验证命令尚未统一检查同一 Task 下未闭合的 Worktree Provision Journal。因此在全局下游写阻断完成前，调用方仍必须先查询 `listRecoverableActions` 并处理未知 Worktree Action。
- Assessment 是 Human 批准前的脱敏只读报告；Journal 持久化其结果、Digest、证据标识和 Resolution，不保存原始 Git 输出。
