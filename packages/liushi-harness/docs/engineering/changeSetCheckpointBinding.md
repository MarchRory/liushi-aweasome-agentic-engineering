# ChangeSet 与 Git Checkpoint 双向绑定

## 1. 目标

CodingTask Session Closeout 不能把调用方自报的路径或 Git Commit 当作实现证据。本切片在 Git 副作用前后独立读取真实现场，并要求二者形成同一个 `ChangeSet Digest`：

1. 提交前从受管 Worktree 状态、目标文件原始字节和已批准 Write Set 生成 `ChangeSet Snapshot`。
2. 调用方先持久化完整 Snapshot，并在 Repository Lock 内调用 `ChangeSetCheckpointPort`。
3. 服务重新读取提交前现场；Snapshot 漂移时不执行 Git 写入。
4. 既有 `GitCheckpointPort` 创建唯一 Commit，或只读恢复已经存在的合法 Commit。
5. 提交后从 `baseRevision..targetRevision` 的真实 Git Diff 和目标文件原始字节重新构造 ChangeSet。
6. 提交前与提交后 `ChangeSet Digest`、Checkpoint Digest 和 Snapshot Digest 共同形成 `bindingDigest`。

该能力证明 Git Checkpoint 与一个精确变更集合绑定，不等于完整 Session Closeout。

## 2. 摘要职责

| 摘要                      | 绑定内容                                                                            | 用途                         |
| ------------------------- | ----------------------------------------------------------------------------------- | ---------------------------- |
| `changeSetDigest`         | Repository、Base Revision、规范变化类型、目标路径、可选原路径、目标原始字节 SHA-256 | 跨 Git Commit 前后复验       |
| `preSubmitSnapshotDigest` | ChangeSet、Worktree、Branch、观测 HEAD、Write Set                                   | 证明提交前现场身份           |
| `checkpointDigest`        | Target Revision 与完整 changed paths                                                | 证明唯一 Git Checkpoint      |
| `bindingDigest`           | Schema Version、Checkpoint Digest、ChangeSet Digest、Pre-submit Snapshot Digest     | Journal 和恢复流程的联合证据 |

删除项的目标内容摘要固定为 `null`。普通文件按原始字节计算 SHA-256，不经过文本解码或换行转换。

## 3. Git 语义规范化

提交前未跟踪文件与提交后的新增文件统一为 `Added`，保证 Commit 不改变 ChangeSet 语义。Rename 确定性展开为原路径 `Deleted` 与目标路径 `Added`；Copy 只形成目标路径 `Added`。Git 的关系型判定仅作为 Inspector 输入提示，永不进入规范 ChangeSet。

Committed Inspector 显式使用 `--no-renames`，因此生产提交后输出只包含内容状态变化，不依赖 Git 配置、相似度阈值或 Copy 候选集合。独立解析器仍关闭式支持 R/C 输入，Domain 会把它们转换为同一内容状态语义；真实 Git 集成测试覆盖 staged rename、未 staged filesystem rename 和 source-modified copy。

未知状态、未合并状态、重复目标、非法路径、空变化、Write Set 越界、Branch/HEAD 漂移、符号链接、特殊文件或读取期间变化均关闭式拒绝。

Committed Inspector 不设置固定文件数或固定输出预算。`--no-renames --name-status -z` 的合法输出上界由已批准完整 Write Set 的路径数量和 UTF-8 长度确定，随企业项目规模线性扩展；越过该语义边界的输出关闭式拒绝。

## 4. 副作用与恢复

- 输入 Snapshot 或身份无效：`NotApplied`。
- 已证明当前现场与持久化 Snapshot 不同：`NotApplied`，Git Checkpoint 不执行。
- 无法证明是否已存在 Checkpoint，或提交前现场读取结果损坏：`OutcomeUnknown`。
- Git 已返回非成功结果：保留底层 Checkpoint 的原始结果。
- Git 成功后无法重建相同 ChangeSet：`OutcomeUnknown`，禁止自动重试。
- 已存在 Checkpoint 且全部摘要匹配：只读恢复为 `Succeeded`，不创建第二个 Commit。

`OutcomeUnknown` 只能由后续 Human 或确定性恢复流程闭合，不能降级为自动重试。

## 5. 分层与调用边界

- Domain 定义 ChangeSet、Snapshot、变化枚举和摘要验证。
- Application 定义提交后 Inspector Port 与 `ChangeSetCheckpointService`，不读取 Git 输出或操作文件。
- Infrastructure 负责 Git 命令、状态解析、路径校验和稳定原始字节读取；所有 Git 调用剥离宿主 `GIT_*` 控制变量，Managed Worktree 同时复验 Repository Top-Level、Worktree Top-Level 和 Common Directory。
- Bootstrap Factory 组合提交前 Inspector、提交后 Inspector、Git Checkpoint 与绑定服务。
- 调用方必须持有 Repository Lock，并负责在任何 Git 副作用前持久化 Snapshot。

Closeout Process State 与 File Store 已能按精确版本持久化完整 Snapshot、Action Evidence 和本服务返回的双向绑定 Checkpoint。`CodingTaskSessionCloseoutManager` 已接入 `HarnessApplication`，在 Repository Lock 内 fresh 读取并校验 Activation、CodingTask、Binding、Repository Root、Managed Worktree、Command Actor、时间、Attempt、Gate 和身份，完成 `beginClosing`、Action Coverage、权威 Snapshot、`persistSnapshot`、Checkpoint execute + inspect 与 `bindCheckpoint`，并严格停止在 `CheckpointBound`。当前尚未实现的部分包括 Closeout CLI、显式恢复命令/恢复 SOP 自动化、真实 Git E2E、Submission/Verification/PRReady 串联、真实 Codex Pilot 和多仓交付。没有这些能力时，不得声明完整生产 Closeout 或真实 Codex Pilot 已完成。
