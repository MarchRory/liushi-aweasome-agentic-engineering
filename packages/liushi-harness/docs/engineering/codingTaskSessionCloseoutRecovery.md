# CodingTask Session Closeout Human-gated 恢复

**状态：只读 Assessment 与 Recovery Process State 已实现；File Store、Human Command 与执行链仍在实现。Closeout State v3 的终态语义保持不变。**

## 1. 决策

`Blocked` 和 `OutcomeUnknown` 不能通过原 Closeout Command 重放恢复。恢复使用独立的 `CloseoutRecovery` Process Record，并由只读 Effective Resolver 在未来向 Submission 投影可消费的 `CheckpointBound`。

不选择修改 `closeout.json` 的原因：

- v3 已把 `Blocked`、`OutcomeUnknown` 和 `CheckpointBound` 定义为不可继续推进的终态。
- 让终态重新进入执行态会破坏既有 successor、版本、CLI 和持久化兼容语义。
- Human 授权、Assessment、执行 Intent 和恢复结果需要独立审计，不能混入原 Agent Closeout Command。
- 独立记录可以整体下线而不删除审计事实，也不影响原 Closeout 的 fail-closed 行为。

## 2. 固定协议

```mermaid
flowchart LR
  A["只读 Assessment"] --> B["Canonical Assessment Digest"]
  B --> C["Human Recovery Command"]
  C --> D["获取 Repository Lock"]
  D --> E["锁内 Fresh Reassessment"]
  E --> F{"Digest、Version、Resolution 一致"}
  F -- "否" --> G["拒绝且零副作用"]
  F -- "是" --> H["持久化 Approved Record"]
  H --> I{"Resolution"}
  I -- "BindExisting" --> J["只读 Inspect"]
  I -- "RetryOnce" --> K["CAS 持久化 Executing Intent"]
  K --> L["Checkpoint Execute 至多一次"]
  L --> J
  J --> M["持久化 CheckpointBound 或终态诊断"]
  M --> N["Effective Closeout Resolver"]
```

Assessment 与 Human Command 之间允许现场变化，但变化必须导致锁内摘要冲突，不能自动接受“足够接近”的结果。

## 3. 只读 Assessment

Assessment 必须绑定：

- Workspace、Session、CodingTask、Repository 和受管 Worktree 身份。
- 原 Closeout State 的 canonical digest、version、status、stopped stage 和 error code。
- Snapshot Digest、Coverage Binding Digest、base revision 和 Write Set。
- Checkpoint 的 `Absent`、`Present` 或 `Unknown` 三态现场结论。
- 当前唯一允许的 Resolution 与稳定诊断。

Assessment Digest 只覆盖规范化正文，不覆盖自身 digest 或由 digest 派生的 Evidence ID。

允许的 Assessment 结论：

| Closeout 现场                                                                                       | 结论                                 |
| --------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `Blocked@SnapshotPersisted` 且错误为 `CheckpointNotApplied`，Checkpoint 明确不存在，Snapshot 未漂移 | 允许 `RetryOnce`                     |
| `OutcomeUnknown@SnapshotPersisted`，已存在 Checkpoint 且完整 ChangeSet 复验通过                     | 允许 `BindExisting`                  |
| `OutcomeUnknown@CheckpointBound`，保留的 Checkpoint 可重新完整复验                                  | 允许 `BindExisting`                  |
| `OutcomeUnknown@Closing`                                                                            | `HumanRequired`，禁止创建执行 Intent |
| Checkpoint、Snapshot、Coverage、Root、Branch、Write Set 或摘要任一不明确                            | `HumanRequired`                      |

`Unknown` 不等于 `Absent`。只有底层三态 Assessment 明确返回 `Absent`，才允许 Human 选择一次 `RetryOnce`。

## 4. Human Command

Recovery Command 必须是完整 Command Envelope，并满足：

- `actor.kind = human`。
- 固定 Command Type 和 `coding_task_session` Aggregate Type。
- `aggregateId` 等于 Session ID。
- `expectedVersion` 精确绑定原 Closeout State version。
- Payload 只包含 Workspace、Session、Assessment Digest 和请求的 Resolution。
- `requestDigest` 与严格 Payload 规范摘要一致。

Resolution 使用封闭枚举：

- `bind_existing`：只读复验已经存在的 Checkpoint，绝不调用 execute。
- `retry_once`：只适用于明确 `NotApplied` 且 Checkpoint 明确不存在的现场。

任何其他 Human 文本只能作为外部说明，不能成为状态机输入。

## 5. Recovery Process State

独立 Recovery Record 使用以下状态：

```mermaid
stateDiagram-v2
  [*] --> Approved
  Approved --> CheckpointBound: BindExisting + inspect passed
  Approved --> Executing: RetryOnce intent persisted
  Executing --> CheckpointBound: inspect passed
  Executing --> RetryNotApplied: execute proved not applied
  Executing --> OutcomeUnknown: execute or persistence uncertain
  Approved --> HumanRequired: fresh assessment drifted
  Executing --> HumanRequired: replay cannot prove checkpoint
```

关键不变量：

1. 原 `closeout.json` 的字节、version 和 status 永不修改。
2. `RetryOnce` 必须先把 `Executing` Intent 通过 CAS 持久化，再调用 Checkpoint execute。
3. `Executing` 的任何重放只能 assess/inspect，禁止再次 execute。
4. `BindExisting` 的全部路径都禁止 execute。
5. `CheckpointBound` 必须保存完整 `ChangeSetCheckpoint`、原 Closeout Digest、Assessment Digest 和 Human Actor。
6. 同一原 Closeout Digest 最多存在一个恢复 Process Record；不同命令身份不能覆盖。
7. 结果写入未知时保留 `Executing` 或 `OutcomeUnknown`，不能推断成功或许可第二次执行。
8. Checkpoint 必须匹配 Process State 锁定的提交前 Snapshot 与 ChangeSet；`BindExisting` 还必须匹配 Assessment 已复验的 Checkpoint Binding。
9. `RetryNotApplied` 与 `OutcomeUnknown` 只能携带各自对应的稳定错误码，禁止状态与诊断相互矛盾。

Process State 保存已经由严格 Human Command parser 验证的 `requestDigest`，并在全部 successor 中保持不可变。State 与 Store 不自行猜测尚未冻结的 Command Payload Schema；Human Command 切片必须负责 canonical payload 摘要重算，Store 只负责严格重建、身份连续性与 CAS。

## 6. 持久化

稳定路径：

```text
<storeRoot>/workspaces/<workspaceId>/codingTaskSessions/<sessionId>/
  closeout.json
  closeoutRecovery.json
  .closeoutRecovery.lock
```

Recovery Store 复用 canonical JSON、create-only 初始化、短时文件锁、`expectedVersion` CAS、原子替换、父目录耐久化和读后复验。Repository Lock 覆盖锁内 reassessment、Intent、Checkpoint 和结果闭合；文件锁只保护 Recovery Record 的单次本地变更。

## 7. Effective Resolver

后续 Submission 不直接判断“原 Closeout 或 Recovery 哪个成功”，只消费 Effective Resolver：

- 原 Closeout 为 `CheckpointBound` 时直接返回原 Checkpoint。
- 原 Closeout 为终态且存在精确绑定的 Recovery `CheckpointBound` 时返回恢复 Checkpoint。
- Recovery Record 缺失、非终态、摘要漂移或身份不一致时返回 unresolved。

本切片只定义并测试 Resolver，不提前修改 Submission、Verification 或 PRReady。

## 8. 实现顺序

1. 已完成 ChangeSet Checkpoint 只读三态 Recovery Port。
2. 已完成 Closeout Recovery Assessment 与 canonical digest。
3. 已完成独立 Recovery Process State、精确状态可达性与 successor 校验。
4. 下一步实现 Recovery Process File Store。
5. 实现 Human Command、Repository Lock 内 fresh reassessment 与至多一次执行。
6. 实现 Effective Resolver。
7. 接入 CLI、故障注入、真实 Git E2E 和恢复 SOP。

每个切片必须独立提交，并保持原 Closeout v3、CLI Exit Code 和真实 Git E2E 全部回归通过。

## 9. 明确不做

- 不自动重试 `OutcomeUnknown`。
- 不允许 Human 直接写入 checkpoint、digest、Snapshot 或 Recovery State。
- 不增加 Artifact 过期算法；现场变化由精确 Assessment Digest 和版本冲突处理。
- 不在本阶段接入多仓补偿、后台 Worker、Submission 或真实 Codex Pilot。
- 不重写共享 File Lock 的历史替换风险；该问题必须独立评审。
