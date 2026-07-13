# 实现 Checkpoint 提交

## 目标

`implementation.submit` 把已经通过受控文件写入形成的 Worktree Diff 提交为单一 Git Checkpoint，并以一条 `ImplementationSubmitted` 事件完成当前 Attempt、记录目标 Revision 与 Changed Paths，随后进入 Verification。

该流程是可恢复 Saga，不宣称 Git Commit 与 Event Store 之间存在跨系统 ACID 事务。任何无法证明的中间结果都返回 `outcome_unknown` 并等待 Human 检查。

## 前置条件

1. CodingTask 必须处于 `Implementation + Active`，目标 Attempt 尚未结束。
2. PlanRisk 及历史业务逻辑变更所需 Gate 必须从权威 Task Replay 重新计算为允许。
3. `repositoryId` 必须由 `RepositoryRootResolverPort` 解析到启动期可信 Root；默认空解析器 fail closed。
4. Worktree Binding 必须标记为 `managed`，真实 Worktree、分支、Base Revision 与 Git Common Directory 必须匹配可信 Repository。
5. 实际 Changed Paths 必须完整位于 Human 已确认的 Write Set。

## 执行顺序

1. Application Command Gateway 预留命令作用域并校验 Runtime Root Digest。
2. 获取 Repository Lock 后重新加载 CodingTask，复核 Version、Attempt、Gate 与可信 Repository Root。
3. 先持久化 `GitMutation` Action Intent，再调用 Git Checkpoint Adapter。
4. Adapter 使用参数数组和 `shell: false` 调用原生 Git，只暂存实际 Changed Paths。
5. Commit 尊重项目 Hook 与签名配置；Harness 不使用 `--no-verify`，也不覆盖 `commit.gpgSign`。
6. Commit 后要求 Worktree 洁净、分支一致、`Base..HEAD` 只有一个 Commit，并以 `--no-renames` 同时核验 rename 的旧路径与新路径。
7. Checkpoint 验收通过后，内部 capability 保护的 CodingTask 入口追加唯一 `ImplementationSubmitted` 事件。

公开 `codingTaskCommands` 不接受 `SubmitImplementation`。调用方不能绕过 Repository Lock、Action Journal、真实 Git 后置检查或可信 Root 绑定，直接提交虚构 Revision。

## 幂等与恢复

- 成功命令重试直接复用持久化 Receipt，不重复 Commit 或 Event。
- Git 已提交但 Event 返回未知时，当前调用会重新读取 CodingTask 与 Git Checkpoint；Event 已可见且二者一致时返回现有 Version。
- Event 仍不可见时，原命令固定为 `outcome_unknown`。Human 检查后可用新的命令接纳满足全部后置条件的既有 Checkpoint；Agent 命令不能使用该恢复路径，也不会重复 Commit。
- 明确 `NotApplied` 的前置条件失败返回稳定的 `precondition_not_met` Receipt。修复条件后必须创建新的 `commandId`、`idempotencyKey` 与 `actionId`，避免改变通用 Command Reservation 生命周期。
- Commit、Journal、Event 或 Lock 结果未知时不得自动重试，必须由 Human 检查 Git HEAD、工作区、Action Journal 与 CodingTask Replay。
- Checkpoint 之后的任何 Version Conflict 或领域收口失败都按未知结果处理，不能伪装成无副作用冲突。

## 当前边界

本切片不生成代码、不生成验证计划、不创建 PR，也不执行合并、推送、发布或部署。Verification 影响面选择、Flaky 分类、Waiver、Independent Verifier 与 PR 交付仍由后续切片提供。
