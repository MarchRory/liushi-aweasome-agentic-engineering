# CodingTask Session Closeout Human-gated 恢复

**状态：只读 Assessment、Recovery Process State、File Store、Human Command Contract、锁内 Handler/Service、Effective Resolver、Composition Root、CLI、确定性故障注入与真实 Git 恢复 E2E 已实现。下游 Delivery Completion 已消费 Effective Resolver 并串联权威 Verification/Evidence/PR-ready；真实 Codex 公开项目 Pilot 已完成。**

## 1. 决策

`Blocked` 和 `OutcomeUnknown` 不能通过原 Closeout Command 重放恢复。恢复使用独立的 `CloseoutRecovery` Process Record，并由只读 Effective Resolver 向后续 Submission 投影可消费的 `CheckpointBound`。

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
- `commandType = coding_task_session.closeout.recover.v1`，Aggregate Type 固定为 `coding_task_session`。
- `aggregateId` 等于 Session ID。
- `expectedVersion` 精确绑定原 Closeout State version。
- Payload 只包含 `workspaceId`、`sessionId`、`expectedAssessmentDigest` 和 `requestedResolution`。
- `requestDigest` 与严格 Payload 规范摘要一致。

严格 parser 只验证 Envelope 与规范 Payload，不在锁外猜测 `expectedVersion` 是否仍匹配现场。`expectedVersion`、`expectedAssessmentDigest` 与 `requestedResolution` 必须在 Repository Lock 内 fresh reassessment 后共同复验，任一漂移都保持零执行副作用。

锁内处理使用以下固定决策：

| Recovery State     | Resolution     | 锁内动作                                                                                | `execute`              |
| ------------------ | -------------- | --------------------------------------------------------------------------------------- | ---------------------- |
| 不存在             | 任一允许值     | Fresh 三元组精确匹配后 create-only `Approved v0`                                        | 否                     |
| `Approved`         | `BindExisting` | 使用 fresh Assessment 已完整复验的 Present Checkpoint，CAS 为 `CheckpointBound v1`      | 永不调用               |
| `Approved`         | `RetryOnce`    | Fresh Assessment 必须仍为 Absent；先 CAS 为 `Executing v1`                              | 仅本次 CAS winner 一次 |
| `Executing`        | `RetryOnce`    | 只读 assess/inspect；Present 时绑定，Absent/Unknown 或无法证明时进入 `HumanRequired v2` | 禁止调用               |
| 任一活动状态       | 现场漂移       | 已有 Record 时 CAS `HumanRequired`；尚无 Record 时直接拒绝                              | 否                     |
| 任一 Recovery 终态 | 任一值         | 返回既有结果，不覆盖、不迁移                                                            | 禁止调用               |

`Executing` 重放不能要求 fresh Assessment Digest 仍等于 Human Command 中的旧值，因为首次 Checkpoint 尝试本身可能把现场从 Absent 改为 Present。重放只允许复验 Recovery Record 的不可变命令、Closeout、Snapshot 与 ChangeSet 身份，再只读 inspect；旧 Assessment 只证明首次执行授权，绝不授权第二次 `execute`。

Resolution 使用封闭枚举：

- `bind_existing`：只读复验已经存在的 Checkpoint，绝不调用 execute。
- `retry_once`：只适用于明确 `NotApplied` 且 Checkpoint 明确不存在的现场。

任何其他 Human 文本只能作为外部说明，不能成为状态机输入。

### 4.1 CLI 与操作顺序

CLI 只暴露三个窄入口，不生成 Human Command，也不接受可以绕过领域校验的 Resolution 参数：

```text
liushi-harness coding-task session closeout assess --workspace <id> --session <id> --repository <id> --root <absolute-path> --json
liushi-harness coding-task session closeout recover --file <human-command.json> --workspace <id> --session <id> --repository <id> --root <absolute-path> --actor-id <human-id> --json
liushi-harness coding-task session closeout effective --workspace <id> --session <id> --json
```

标准操作顺序：

1. Human 运行 `assess`，审阅 `assessmentDigest`、`disposition`、`allowedResolution` 与 `diagnostic`。
2. 只有 `disposition=resolution_available` 时，Human 才按第 4 节创建完整 Command Envelope；`requestedResolution` 必须等于 Assessment 唯一允许值。
3. Human 运行 `recover`。CLI 先复验命令行 Actor、Workspace、Session 与文档绑定，再由 Application Command Gateway 在 Repository Lock 内重新评估；CLI 不直接写 Recovery State 或 Checkpoint。
4. `committed` 或 `duplicate` 返回退出码 `0`；冲突或需要 Human 决策返回 `4`；Repository Lock 暂不可用返回 `5`；结果未知返回 `8`，调用方不得自动重试。
5. Human 或后续流水线运行 `effective`。只有返回 `resolved`，下游才可消费其 Checkpoint；`unresolved` 返回退出码 `4`。

`--root` 与 `--actor-id` 仍是操作员声明，不是身份认证。企业接入必须由受信包装器或批准后的 Registry 注入 Repository Root 和 Human 身份；Coding Agent 不应拥有 Runtime Store 写权限。

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

Process State 保存已经由严格 Human Command parser 验证的 `requestDigest`，并在全部 successor 中保持不可变。Command Payload Schema 与 canonical 摘要重算由 Human Command 模块统一负责；State 与 Store 不重复解析 Command，只负责严格重建、身份连续性与 CAS。

## 6. 持久化

稳定路径：

```text
<storeRoot>/workspaces/<workspaceId>/codingTaskSessions/<sessionId>/
  closeout.json
  closeoutRecovery.json
  .closeoutRecovery.lock
```

Recovery Store 复用 canonical JSON、create-only 初始化、短时文件锁、`expectedVersion` CAS、原子替换、父目录耐久化和读后复验。Repository Lock 覆盖锁内 reassessment、Intent、Checkpoint 和结果闭合；文件锁只保护 Recovery Record 的单次本地变更。

File Store 已实现以下关闭式语义：

- 只允许 `Approved v0` 初始化；相同恢复身份复用现有进度，不同身份返回显式冲突。
- `replace` 在独立文件锁内重读 current，校验精确 `expectedVersion` 与合法 successor，再原子替换并读后复验。
- 写入开始后的文件替换、父目录耐久化或读后复验异常统一返回 Recovery 专属 `CommitOutcomeUnknown`，禁止隐式重试。
- 文件锁释放结果未知返回 Recovery 专属稳定错误码，并保留锁内操作原始失败。
- `IoFailure`、读取期实体漂移与内容损坏保持不同错误语义；相邻 `closeout.json` 不被读取或修改。

当前路径校验与共享 File Store 一致，会拒绝校验时可见的符号链接和目录联接；“校验完成后祖先目录被并发替换”的 TOCTOU 风险尚未由共享文件基础设施关闭。该风险不能在 Recovery Store 内混入平台特判，必须作为共享路径句柄/no-follow 能力独立设计并在不可信目录真实 Pilot 前完成。

## 7. Effective Resolver

后续 Submission 不直接判断“原 Closeout 或 Recovery 哪个成功”，只消费 Effective Resolver：

- 原 Closeout 为 `CheckpointBound` 时直接返回原 Checkpoint。
- 原 Closeout 为终态且存在精确绑定的 Recovery `CheckpointBound` 时返回恢复 Checkpoint。
- Recovery Record 缺失、非终态、摘要漂移或身份不一致时返回 unresolved。

当前 Resolver 严格只接受 `workspaceId` 与 `sessionId`，并以只读 `load`/`find` 能力组合两份持久化事实。原 `CheckpointBound` 会短路返回，不读取 Recovery 或计算摘要；恢复路径必须逐项匹配 Workspace、Session、CodingTask、Task、Repository、Attempt、原 Closeout version 与完整 State Digest，以及 Snapshot、ChangeSet、Checkpoint 路径绑定。Store 损坏、I/O 或摘要计算异常保持失败，不能降级成 unresolved。

Resolver 本身仍保持只读。后续独立 Delivery Submission 已将其结果接入 CodingTask，不修改 Recovery State 或原 Closeout State。

### 7.1 真实 Git 恢复证据

确定性 E2E 复用生产 Composition Root 中与 Closeout Manager 同一实例的 Checkpoint Port，只对一次调用注入结果边界；`assess`、`recover` 与 `effective` 均通过 `createProductionCliApplicationFactory` 和 `runCli` 重新创建生产 Application：

- `NotApplied` 场景从 `Blocked@SnapshotPersisted`、Checkpoint `Absent` 开始，经 Human 明确选择 `RetryOnce` 后从零 Commit 变为唯一一个 Commit。
- 真实 Checkpoint 已提交但结果观察丢失的场景进入 `OutcomeUnknown@SnapshotPersisted`，Assessment 复验为 `Present` 后只允许 `BindExisting`，恢复前后始终只有一个 Commit。
- 两个场景都复验精确 Human Command、真实 Git HEAD、干净 Worktree、Effective Checkpoint 来源和原 `closeout.json` 字节不变；精确 Command 重放返回首个稳定回执且不产生第二次 Git 副作用。

这些证据验证确定性本地恢复协议。独立 Delivery E2E 已进一步证明 Recovery Checkpoint 可在不重复 Git Commit 的前提下进入 CodingTask Verification；它仍不替代真实 Codex/企业 Pilot、外部身份认证、不可信 Runtime Store 的祖先目录 TOCTOU 验收，也不证明 Verification/Evidence/PRReady 已自动串联。

## 8. 实现顺序

1. 已完成 ChangeSet Checkpoint 只读三态 Recovery Port。
2. 已完成 Closeout Recovery Assessment 与 canonical digest。
3. 已完成独立 Recovery Process State、精确状态可达性与 successor 校验。
4. 已完成 Recovery Process File Store、create-only 初始化、CAS、严格重建与未知结果分类。
5. 已完成 Human Command Contract、严格 parser 与 canonical request digest 重算。
6. 已完成 Repository Lock 内 fresh reassessment、create-only/CAS 状态推进、至多一次 Checkpoint 执行、Executing 只读恢复和 Command Gateway Service。
7. 已完成 Effective Resolver、原成功短路、恢复精确绑定和稳定 unresolved 分类。
8. 已完成生产 Composition Root、三个 Recovery CLI 入口、稳定退出码、Human 脱敏摘要和恢复 SOP。
9. 已完成 `RetryOnce` 与 `BindExisting` 的确定性故障注入和真实 Git 恢复 E2E。
10. 已完成独立 Delivery Submission、Verification、Evidence、PRReady、Original/Recovery 真实 Git E2E 与真实 Codex 公开项目 Pilot；下一步是脱敏企业需求 Pilot 和量化。

每个切片必须独立提交，并保持原 Closeout v3、CLI Exit Code 和真实 Git E2E 全部回归通过。

## 9. 明确不做

- 不自动重试 `OutcomeUnknown`。
- 不允许 Human 直接写入 checkpoint、digest、Snapshot 或 Recovery State。
- 不增加 Artifact 过期算法；现场变化由精确 Assessment Digest 和版本冲突处理。
- 不在 Recovery 阶段接入多仓补偿、后台 Worker、Verification 编排或真实 Codex Pilot。
- 不重写共享 File Lock 的历史替换风险；该问题必须独立评审。
