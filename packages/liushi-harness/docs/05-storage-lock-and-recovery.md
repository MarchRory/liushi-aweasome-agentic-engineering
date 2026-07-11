# 05 存储、锁与恢复

## 1. 目标

首月采用本地文件型存储，不引入数据库或 Daemon。存储层必须支持：

- Windows、macOS 和 Linux。
- 进程崩溃和机器重启恢复。
- 多任务和多进程冲突检测。
- Append-only 事件与可重建 Snapshot。
- 原子写入、幂等副作用和可解释修复。
- Uninstall 时不误删用户文件。

## 2. 存储分区

### 2.1 用户运行时

不提交 Git：

```text
~/.liushi-harness/
├── config.yaml
├── policy.yaml
├── installations.json
└── workspaces/<workspace-id>/
    ├── workspace.json
    ├── policy.yaml
    ├── repositories.json
    ├── tasks/<task-id>/
    │   ├── snapshot.json
    │   ├── events.jsonl
    │   ├── actions.jsonl
    │   ├── artifacts/
    │   ├── evidence/
    │   ├── working-memory/
    │   └── logs/
    ├── memory/
    │   ├── candidates/
    │   └── retrieval-index/
    └── locks/
```

### 2.2 仓库长期状态

可以提交 Git，由团队 Review：

```text
<repo>/.liushi-harness/
├── project.yaml
├── policy.yaml
├── knowledge/
├── instructions/
├── agents/
├── memory-policy.yaml
├── evals/
└── managed-files.json
```

执行器原生文件如 `.codex/`、`.claude/`、`.agents/skills/`、`AGENTS.md` 和 `CLAUDE.md` 可以由安装器生成，但必须登记在 `managed-files.json` 中。未登记文件不属于 Harness。

### 2.3 外部长期状态

- 企业 Wiki、Issue Tracker 和文档系统。
- 首月只读同步和写入 Draft。
- 外部正式写入需要 Human Gate 和幂等键。
- 外部系统不是 Task State Machine 的唯一状态源。

## 3. 事件模型

每个事件占 JSONL 一行：

```ts
/** Task Event Store 中允许持久化的核心事件类型。 */
export enum TaskEventType {
  /** Task 已绑定 Workspace 并完成初始创建。 */
  TaskCreated = "task_created",
  /** ContextBundle 所需输入已完成采集和校验。 */
  ContextPrepared = "context_prepared",
  /** 一个正式 Artifact Revision 已通过 CLI Commit。 */
  ArtifactCommitted = "artifact_committed",
  /** Task 已创建一个阻断性 Human DecisionRequest。 */
  DecisionRequested = "decision_requested",
  /** Human ApprovalRecord 已通过身份和 Digest 校验。 */
  ApprovalRecorded = "approval_recorded",
  /** Task Phase、RunState 或 Checkpoint 已合法迁移。 */
  StateTransitioned = "state_transitioned",
  /** 可能产生副作用的 Action Intent 已持久化。 */
  ActionIntentRecorded = "action_intent_recorded",
  /** Harness 已观察到 Action 的实际后置状态。 */
  ActionObserved = "action_observed",
  /** Action 结果已与 Task State 原子提交。 */
  ActionCommitted = "action_committed",
  /** Task 已安全暂停。 */
  TaskPaused = "task_paused",
  /** Task 因不可自动恢复错误而失败。 */
  TaskFailed = "task_failed",
  /** Task 已由 Human 或上游系统取消。 */
  TaskCancelled = "task_cancelled",
  /** Task 已满足最终完成条件。 */
  TaskCompleted = "task_completed",
}

/** Append-only Task Event Log 中的一条规范事件。 */
export interface TaskEvent {
  /** 当前 Event Schema 的语义版本。 */
  schemaVersion: string;
  /** 使用 ULID 生成的全局唯一 Event ID。 */
  eventId: string;
  /** Task 内严格递增且不重复的事件序号。 */
  sequence: number;
  /** Event 所属 Workspace。 */
  workspaceId: string;
  /** Event 所属 Task。 */
  taskId: string;
  /** 核心事件的封闭类型。 */
  type: TaskEventType;
  /** 使用 ISO 8601 UTC 表示的事实发生时间。 */
  occurredAt: string;
  /** 触发或提交该事件的 Actor。 */
  actor: ActorRef;
  /** 由具体 Event Type Schema 校验的事件内容。 */
  payload: unknown;
  /** 前一个事件的 Hash；首个事件不存在。 */
  previousHash?: string;
  /** 当前事件规范 JSON 的完整性 Hash。 */
  hash: string;
}
```

要求：

- `eventId` 使用 ULID，`sequence` 在 Task 内严格递增。
- Hash Chain 用于发现截断、重排和意外修改，不宣称防恶意篡改。
- 事件一旦提交不得原地修改；修正通过补偿事件表达。
- Snapshot 包含最后应用的 `sequence` 和 `hash`。

## 4. 提交协议

规范状态变更：

1. 获取 Task Lock。
2. 读取并验证 Snapshot 与 Event Tail。
3. 计算状态迁移和新 Artifact。
4. 将 Artifact 写入临时文件并 `fsync`。
5. 原子 Rename Artifact。
6. 在锁内追加事件并刷新文件。
7. 将新 Snapshot 写入临时文件并原子 Rename。
8. 释放 Lock。

如果 Snapshot 写入失败，恢复时从事件重放。Artifact 和事件 Digest 不匹配时进入只读 Recovery Mode，不能猜测正确状态继续写。

## 5. Action Journal 与幂等

文件修改、Git、Connector 和外部写入不是普通状态变更，使用两阶段 Action Journal：

```text
ACTION_INTENT -> SIDE_EFFECT -> ACTION_OBSERVED -> ACTION_COMMITTED
```

`ACTION_INTENT` 必须在执行副作用前持久化并刷新到磁盘。否则进程崩溃后无法区分“从未计划执行”和“可能已经执行但未记录”。

每个 Action 包含：

- `actionId` 和稳定 `idempotencyKey`。
- 类型、输入 Digest、目标资源和期望后置条件。
- 执行前 Revision。
- 执行结果和可复查 Evidence。
- 补偿或人工恢复说明。

崩溃发生在副作用之后、提交之前时，`recover` 必须检查目标资源：

- 后置条件已满足：记录 `ACTION_RECOVERED`，不得重复执行。
- 明确未执行：允许重试同一 Idempotency Key。
- 状态不确定：进入 `waiting_human`。

外部系统不支持幂等键时，首月不得自动重试写入。

## 6. 锁模型

锁域：

- Workspace Registry Lock：修改仓库登记和全局配置。
- Task Lock：状态、Artifact 和事件提交。
- Repository Write Lock：Worktree 和仓库写操作。
- Connector Write Lock：同一外部资源的写入。

同时需要多个锁时固定顺序：

```text
Workspace -> Task -> Repositories in normalized path order -> Connector
```

任何模块不得逆序获取锁。尽量避免长时间嵌套持锁；模型调用、Human 等待和长测试不能持有 Task Lock。

锁记录至少包含：

- Process ID、Host、Started At、Heartbeat。
- Workspace、Task、Repository 和 Action ID。
- CLI Version 和 Lock Schema Version。

Stale Lock 不可仅根据 PID 不存在直接删除，还要检查 Heartbeat、Host 和 Action Journal。`repair --unlock` 必须展示证据并请求 Human 确认。

## 7. 并发限制

发布初期：

- 每个 Workspace `maxActiveTasks=1`。
- 每个 Repository `maxWriteTasks=1`。
- 只读扫描可以受控并行。

满足以下测试后才将默认 Active Task 提升到 2：

- 双进程竞争同一 Task。
- 双 Task 竞争同一仓库。
- 锁持有进程被强制终止。
- Windows 文件占用和原子 Rename。
- Snapshot 写入前后崩溃。
- Stale Lock Repair 和误判保护。

用户可以配置更高并发，但 Release Default 不在没有实测证据时提高。

## 8. 恢复流程

```powershell
liushi-harness doctor
liushi-harness recover --workspace <id> --task <id> --dry-run
liushi-harness recover --workspace <id> --task <id> --apply
```

恢复步骤：

1. 验证 Store Layout 和 Schema。
2. 验证 Event Sequence、Hash Chain 和 Snapshot Tail。
3. 重放 Snapshot 之后的事件。
4. 检查未完成 Action Journal。
5. 检查 Worktree、Git Revision 和 Harness 外变更。
6. 校验已提交 RuleBundle Digest、Rule Catalog 和 Architecture Mechanism Revision 是否漂移。
7. 生成 Recovery Plan，不立即写入。
8. 无歧义修复可以自动应用；有歧义时请求 Human。

## 9. 故障矩阵

| 故障                | 检测                      | 默认处理                   |
| ------------------- | ------------------------- | -------------------------- |
| Snapshot 截断       | JSON/Checksum 失败        | 从 Events 重建             |
| Event Tail 截断     | 行解析或 Hash 失败        | 保留损坏文件，进入只读修复 |
| Artifact 缺失       | Event 引用不存在          | Fail，不能跳过             |
| Hook 未运行         | 缺少 Hook ExecutionRecord | CLI/CI 重新校验            |
| 模型中断            | Proposal 不完整           | 丢弃 Proposal，不改变状态  |
| 测试进程中断        | 无完整退出记录            | 标记未通过并重新执行       |
| 外部写状态未知      | Intent 无 Observation     | 不自动重试，Human 决策     |
| Worktree 被人工修改 | Git 状态与 Journal 不符   | 暂停并展示 Diff            |
| Base Revision 漂移  | HEAD 与 Context 不同      | 重新做影响分析和 Gate      |

## 10. 安装所有权与卸载

`managed-files.json` 记录：

- 文件路径、创建前状态和安装后 Digest。
- Owner Package、Profile 和版本。
- 模板来源和是否允许重新生成。

升级或卸载规则：

- Digest 等于 Harness 最后写入值时可以安全替换或删除。
- 文件被 Human 修改时只生成 Diff，不覆盖或删除。
- Uninstall 默认保留 Task、Evidence 和团队知识。
- `--purge-runtime` 必须单独确认并列出绝对路径。
- 不递归删除未验证的计算路径。

## 11. 数据安全

- 不在事件中保存 Secret 明文。
- Connector Credential 使用执行器或系统现有凭据管理。
- 日志写入前执行路径、Token 和常见密钥格式脱敏。
- Wiki 原文按需缓存，并支持 TTL 和显式清理。
- Evidence 保存最小必要片段和 Digest，避免复制整个企业文档。
- 默认不上传远程遥测。

## 12. 测试要求

Store 进入生产路径前必须覆盖：

- Property-based 状态迁移和 Event Replay。
- Artifact 原子写入故障注入。
- Windows、macOS、Linux 路径与锁。
- 同进程、跨进程和崩溃并发。
- Upgrade、Repair、Recover 和 Uninstall。
- 外部 Action 幂等与未知状态。
- 未管理文件零误删。
