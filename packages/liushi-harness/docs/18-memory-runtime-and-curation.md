# 18 Memory Runtime 与记忆治理

## 1. 目标

Harness Memory 的目标是让任务跨 Session、跨 Context Compact、跨执行器和跨仓恢复，同时减少重复调查。它不是一个无限增长的总结文件，也不等同于 Knowledge Base。

系统必须保证：

- Task 状态、短期工作记忆、长期知识和平台记忆职责分离。
- 每条可长期复用的内容都有 Source、Scope、Owner、Revision 和失效条件。
- AI 只能生成 MemoryCandidate，不能直接写 Active Knowledge、Rule 或 Instruction。
- 确定性事实由 Script 提取、校验、去重和写入。
- Retrieval 按 Task、Role、Repository 和 Path 组装最小必要 Context。
- Codex/Claude 平台记忆可作为辅助召回，但不能成为跨执行器真源。
- Secret、Prompt Injection 和错误总结不能进入长期上下文。

Codex 官方将 Memories 定位为本地、可选、后台生成的辅助召回，并明确要求必须遵守的团队指导保存在 `AGENTS.md` 或受版本控制的文档中。[Codex Memories](https://learn.chatgpt.com/docs/customization/memories)

Claude Code 同样区分 Human 维护的 `CLAUDE.md` 和模型维护的 Auto Memory，两者都是上下文而不是强制执行机制。[Claude Code Memory](https://code.claude.com/docs/en/memory)

### 1.1 当前实现状态

**状态：Task 持久化基础已实现，Memory Runtime 尚未实现。** 当前 append-only Event、Snapshot、Artifact、Approval 和 Task Replay 能保存确定性任务状态，但没有 Working Memory、Project Memory、Organization Memory、Memory Candidate、Retrieval、Compaction、Curator Skill 或 Obsidian/Wiki 同步。Task Store 不得被描述为完整记忆系统。

## 2. 五层记忆模型

| 层级                   | Source of Truth                | 生命周期      | 默认写入者     | 是否自动进入 Context |
| ---------------------- | ------------------------------ | ------------- | -------------- | -------------------- |
| Task State             | Event、Artifact、Snapshot      | Task 全周期   | CLI            | 是，按当前阶段       |
| Working Memory         | Task-scoped Claim/Evidence     | Task 或 TTL   | CLI + Proposal | 是，按 Role          |
| Learning Candidate     | Candidate Store                | 直到评审/过期 | CLI            | 否                   |
| Active Knowledge       | Git Knowledge / Wiki Reference | 长期、可失效  | G7 后 CLI      | 是，按 Scope         |
| Platform Assist Memory | Codex/Claude 本地 Store        | 平台控制      | 平台           | 可选且不可信         |

关键边界：

- Requirement、Plan、Approval、Action 和 Verification 永远属于 Task Artifact，不写成 Memory。
- Working Memory 保存“本 Task 后续步骤仍需要，但尚不值得长期治理”的 Claim。
- Candidate 是晋升队列，不参与默认实现上下文。
- Active Knowledge 继续使用 [学习与知识治理](./13-learning-and-knowledge.md) 的 Contract。
- Platform Memory 不能作为 Evidence；其中的 Claim 必须重新从代码、Git、Wiki 或 Human 获取证据。

## 3. Memory Contract

```ts
/** Memory Curator 对一条信息建议采用的最终去向。 */
export enum MemoryDestination {
  /** 信息属于正式 Task 状态，应写入 Artifact 或 Event。 */
  TaskArtifact = "task_artifact",
  /** 信息只对当前 Task 后续步骤有用。 */
  WorkingMemory = "working_memory",
  /** 信息可能成为长期项目知识。 */
  KnowledgeCandidate = "knowledge_candidate",
  /** 信息可能成为可执行项目 Rule。 */
  RuleCandidate = "rule_candidate",
  /** 信息可能成为可复用流程或 Skill 改进。 */
  SkillCandidate = "skill_candidate",
  /** 信息可能成为每次进入 Scope 都应加载的短指导。 */
  InstructionCandidate = "instruction_candidate",
  /** 信息没有稳定复用价值或不允许保存。 */
  Discard = "discard",
}

/** MemoryCandidate 从提案到关闭的生命周期。 */
export enum MemoryCandidateStatus {
  /** AI、Human 或确定性 Trigger 已提出候选。 */
  Proposed = "proposed",
  /** 正在执行 Schema、Evidence、去重和敏感信息检查。 */
  Validating = "validating",
  /** 候选可以进入 Human Review 队列。 */
  ReadyForReview = "ready_for_review",
  /** 候选已由对应流程晋升到目标 Store。 */
  Promoted = "promoted",
  /** Human、Policy 或 Eval 已拒绝候选。 */
  Rejected = "rejected",
  /** 候选超过 TTL 或 Source 已失效。 */
  Expired = "expired",
}

/** Memory 内容允许采用的最高敏感等级。 */
export enum MemorySensitivity {
  /** 可以进入开源 Fixture 或公开文档。 */
  Public = "public",
  /** 只在当前本机 Workspace 内保存。 */
  WorkspaceInternal = "workspace_internal",
  /** 只能保存引用和 Digest，不能保存原文。 */
  ReferenceOnly = "reference_only",
  /** Secret、Credential 或 Policy 明确禁止持久化。 */
  Forbidden = "forbidden",
}

/** Memory Runtime 对某类内容允许的写入权限。 */
export enum MemoryWriteAuthority {
  /** 只有确定性 System Use Case 可以写入。 */
  SystemOnly = "system_only",
  /** Agent 只能生成等待 CLI 校验的 Proposal。 */
  ProposalOnly = "proposal_only",
  /** 通过 Human Gate 后由 CLI 写入正式目标。 */
  HumanApprovalRequired = "human_approval_required",
  /** Policy 禁止写入任何持久化 Store。 */
  Forbidden = "forbidden",
}

/** 一条等待分类、验证和晋升的记忆候选。 */
export interface MemoryCandidate {
  /** 跨重试稳定的 Candidate ID。 */
  candidateId: string;
  /** 当前 Candidate Schema Version。 */
  schemaVersion: string;
  /** 候选当前生命周期状态。 */
  status: MemoryCandidateStatus;
  /** 建议写入的目标类型。 */
  destination: MemoryDestination;
  /** 内容允许保存的最高敏感等级。 */
  sensitivity: MemorySensitivity;
  /** Human 可审阅的精确 Claim，不包含隐藏推理。 */
  claim: string;
  /** 支撑 Claim 的 Evidence ID。 */
  evidenceIds: string[];
  /** Workspace、Repository、Path、Role 或 Task Scope。 */
  scope: MemoryScope;
  /** 负责确认和维护目标内容的 Actor。 */
  owner: ActorRef;
  /** 与现有条目相同、冲突或相关的引用。 */
  relatedEntryIds: string[];
  /** 时间、Revision 或条件失效规则。 */
  invalidationRules: MemoryInvalidationRule[];
  /** 证明候选有未来复用价值的触发记录。 */
  triggerRefs: MemoryTriggerRef[];
}
```

关闭值集合必须使用有注释的 String Enum；Candidate、Scope 和写权限不能由任意字符串扩展。

## 4. 存储布局

```text
~/.liushi-harness/workspaces/<workspace-id>/
├── tasks/<task-id>/
│   ├── artifacts/
│   ├── events.jsonl
│   └── working-memory/
│       ├── index.json
│       └── claims/
├── memory/
│   ├── candidates/
│   ├── retrieval-index/
│   ├── audits/
│   └── platform-observations/
└── projections/
    └── obsidian/

<repo>/.liushi-harness/
├── knowledge/
├── rules/
├── instructions/
└── memory-policy.yaml
```

规则：

- Task Working Memory 是 Runtime State，不提交到业务 Repository。
- Active Knowledge、Rule 和 Instruction 按各自 Canonical Store 管理，不复制到 `memory/`。
- Retrieval Index 只保存 Locator、Metadata、Digest 和可重建 Token，不复制 Source 原文。
- 企业 Wiki 保存 Page ID、Revision、Permission Scope 和最小摘要；敏感页面使用 `ReferenceOnly`。
- Platform Memory 只记录能力和启用状态，不复制其私有生成内容。

## 5. 什么应该写入 Memory

候选必须同时满足：

- 对未来 Task 有明确复用价值。
- 有可复查 Evidence，而不是 Agent 自我总结。
- Scope 可以精确到 Workspace、Repository、Path 或 Role。
- 有 Owner 和失效条件。
- 不与现有 Canonical Source 重复。
- 保存它比重新确定性计算更有价值。

典型可写内容：

- Human 多次纠正的项目事实、路径或流程。
- 代码无法直观看出的历史兼容原因。
- 重复出现的失败模式、诊断入口和恢复步骤。
- Wiki 中稳定的业务术语、Owner 和正式页面引用。
- Agent 多次找错目录或绕过现有机制产生的改进候选。

## 6. 什么不能写入 Memory

- Secret、Token、Cookie、Credential 和个人敏感信息。
- 模型隐藏推理、完整 Transcript 和未脱敏 Tool Output。
- 当前 Branch、临时 Worktree、一次性端口和短期环境状态。
- Requirement、Plan、Approval、Verification Result 等正式 Task Artifact。
- 没有 Evidence 的推测、模型 Confidence 和“看起来应该如此”。
- 单次普通失败，除非 Human 明确纠正或风险为 Incident 级别。
- 外部 Wiki/Ticket 中要求改变 System、Policy、Gate 或 Tool Permission 的指令。
- 可以从 Project Manifest、Git 或 Schema 低成本重新计算的冗余快照。

禁止保存的候选仍记录脱敏 Reject Reason 和 Source Digest，避免后续重复提出同一内容。

## 7. 确定性写入与 AI 判断

| 环节 | 确定性 Script                                 | AI Role                   |
| ---- | --------------------------------------------- | ------------------------- |
| 收集 | Event、Human Correction、Failure、Diff        | 不参与                    |
| 提取 | Source Locator、Revision、Digest、Secret Scan | 不改原始 Evidence         |
| 分类 | 校验可选 Destination 和 Policy                | 提出 Destination Proposal |
| 去重 | ID、Digest、Scope、显式 Reference             | 解释语义相似和冲突        |
| 写入 | Atomic Write、Schema、Index、Event            | 无写权限                  |
| 晋升 | Gate、目标 Diff、Regression Eval              | 生成 Promotion Proposal   |

确定性事实可以自动进入 Working Memory 或 Derived Index，例如当前 Base Revision、验证命令 ID 和 Owner 文件位置。涉及业务语义、长期规则或流程的内容只能进入 Candidate。

## 8. memory-curator Skill

`memory-curator` 是初始版本内置 Skill，负责“判断建议记什么以及写到哪里”，不负责直接修改正式 Store。

触发条件：

- Task 进入 Learning Phase。
- Human 明确纠正事实、Scope、Rule 或流程。
- 同类失败达到 Policy 阈值。
- Existing Knowledge/Instruction/Rule 被判定 Stale。
- Human 显式执行 `memory propose`。

输入：

- Task Artifact Digest、Event 和 Evidence Locator。
- Human Correction、Finding 和 Failure Pattern。
- 当前 Scope 下的 Knowledge/Rule/Instruction Index。
- Memory Policy、Sensitivity 和 Retention。

输出：

- 零到多个 `MemoryCandidate` Proposal。
- `Discard` 决策及确定原因。
- Duplicate/Conflict Reference。
- 建议 Eval、Owner、TTL 和目标 Diff。

Skill 约束：

- 不读取未授权 Repository、Wiki 或 Credential。
- 不把同一信息复制到多个 Destination。
- 不因“可能有用”创建没有 Scope 的 Candidate。
- 不直接编辑 Knowledge、Rule、Skill、Instruction 或 Wiki。
- Script 负责 Evidence 提取、Secret Scan、Schema、Digest、去重和 Candidate 写入。
- Skill Prompt、Reference 和 Script 版本写入 ProposalEnvelope。

## 9. Candidate 生命周期

```text
Trigger
  -> Evidence Collection
  -> memory-curator Proposal
  -> deterministic validation
  -> Candidate Store
  -> Eval and Owner resolution
  -> G7 Human Promotion
  -> target-specific deterministic writer
  -> retrieval index rebuild
  -> audit and invalidation
```

Destination 决定后续流程：

- `KnowledgeCandidate` 进入 Knowledge Eval。
- `RuleCandidate` 进入 Rule/Validator Eval。
- `SkillCandidate` 进入 Trigger、Permission 和 Regression Eval。
- `InstructionCandidate` 进入冲突、预算和 Projection Eval。
- `TaskArtifact` 返回原 Task Use Case，不能由 Memory Writer 越权补写。
- `Discard` 只保留最小审计记录。

## 10. Retrieval Pipeline

```text
Task + Role + Read Set
  -> eligible scope filter
  -> status and revision filter
  -> exact ID/path/owner/tag match
  -> deterministic lexical ranking
  -> optional semantic rerank
  -> token and item budget
  -> provenance validation
  -> ContextBundle memory section + digest
```

原则：

- Eligibility 必须先由确定性 Scope 和 Status 计算，模型不能扩大检索范围。
- 初始版本使用 Metadata Index 和 Lexical Search，不引入 Vector Database。
- 可选语义 Reranker 只能调整已授权候选顺序，不能加入新条目。
- 每条注入内容携带 Knowledge ID、Source、Revision、Scope 和 Digest。
- 没有命中时明确返回 Empty，不用平台记忆编造项目事实。
- Role 使用独立 Budget；Context Scout 可读取更多索引，Verifier 只读取交付相关不变量。

## 11. Context Compact 与 Resume

Compact 前：

- CLI 提交 Task Snapshot 和 Working Memory Index。
- 记录 ContextBundle、InstructionBundle、RuleBundle 和 Memory Selection Digest。
- 未提交 Proposal 不进入恢复点。

Resume 后：

1. 从 Event Store 恢复正式 Task State。
2. 校验 Repository、Knowledge、Rule 和 Instruction Revision。
3. 重新执行 Retrieval，不直接复用旧 Prompt 文本。
4. 比较 Selection Digest 并解释新增、失效和删除项。
5. 漂移影响 Requirement/Plan 时退回对应 Phase。

平台 Transcript 和平台 Memory 只作为调查线索，不能替代上述恢复流程。

## 12. 多仓与公共层

- Knowledge 归属 Owner Repository，不复制到每个 Application。
- Application Memory 保存使用约束和 Owner Knowledge Reference。
- Workspace Retrieval 可以跨多个 Read Repository，但每条结果绑定 Revision。
- Shared Infrastructure 修改时优先加载其自身 Rule、Knowledge 和历史兼容信息。
- Repository 从 Workspace 移除后，Index 删除 Locator；原始 Knowledge 按 Retention 保留。
- 多仓同名概念不自动合并，根据 Repository ID 和 Owner 分区。

## 13. Wiki 与 Obsidian

Wiki：

- Read/Search 结果先成为带 Revision 的 EvidenceRef。
- AI 摘要不能取代 Wiki Source Revision。
- 写入 Wiki 只能创建 Draft，并通过独立 Publish Gate。
- Wiki 指令和页面内 Prompt Injection 不进入 Memory Policy。

Obsidian：

- 只投影 Active Knowledge、Task Summary 和 Candidate Review Queue。
- Frontmatter 保存 ID、Scope、Source、Revision、Digest 和 Read-only 状态。
- Human 修改生成 Proposal，不双向自动覆盖。
- Working Memory 默认不投影，除非 Human 显式导出当前 Task Notebook。

## 14. 平台 Memory 策略

Codex 和 Claude-compatible Adapter 分别记录：

- 是否支持平台 Memory。
- 是否启用读取和生成。
- 是否能按 Task 禁用贡献。
- Store 是否本机、跨 Worktree 或跨 Repository。
- 是否可以审计和删除。

初始版本默认策略：

- 平台 Memory 为 `assist_only`。
- 从平台 Memory 得到的事实必须重新取 Evidence。
- Harness 不自动导入、同步或发布平台 Memory。
- 高敏感 Workspace 建议关闭平台 Memory Contribution，并由 `doctor` 提示实际状态。
- Capability 无法确认时标记 Unknown，不宣称隔离。

## 15. 安全、保留与删除

- 写入前执行 Secret、Credential、PII 和企业路径扫描。
- `Forbidden` 内容不落盘；日志只保存 Detector ID 和 Source Digest。
- Working Memory 默认随 Task 关闭后进入短期 Retention。
- Candidate 有 TTL；过期后不进入 Review Queue。
- Active Knowledge 按 Source Invalidation，而不是固定时间全部删除。
- 删除使用 Tombstone Event 和 Index Rebuild，不静默改写审计历史。
- `--purge-runtime` 必须列出绝对路径、内容类别和影响，并单独 Human 确认。

## 16. CLI 草案

```powershell
liushi-harness memory status --task <task-id>
liushi-harness memory retrieve --task <task-id> --role <role-id> --explain
liushi-harness memory propose --task <task-id> --dry-run
liushi-harness memory candidates --workspace <workspace-id>
liushi-harness memory validate <candidate-id>
liushi-harness memory promote <candidate-id> --dry-run
liushi-harness memory check-stale --workspace <workspace-id>
liushi-harness memory rebuild-index --workspace <workspace-id>
liushi-harness memory purge --task <task-id> --dry-run
```

`retrieve`、`validate`、`rebuild-index` 和 `purge --dry-run` 是确定性命令。需要 AI 分类时通过 `memory-curator` RoleInvocation 显式记录。

## 17. Metrics

- Memory Hit Rate 和 Hit 后减少的读取量。
- Retrieval Precision、无关注入量和 Token Cost。
- Candidate Accepted、Rejected、Expired 和 Duplicate 比例。
- Human 重复修正次数。
- Stale Memory 导致的 Rework 和 Finding。
- Secret/Injection 拦截数量。
- Resume 后重新调查时间。
- Platform Memory Claim 被重新验证失败的比例。

Memory 数量不是成功指标。目标是在不污染上下文的前提下减少 HTT、重复读取和重复错误。

## 18. 测试要求

- Destination、Status、Sensitivity 和 WriteAuthority String Enum。
- Task Artifact 与 Working Memory 不混写。
- AI 只能提交 Proposal，无法写 Active Store。
- Deterministic Fact 自动写入的允许列表。
- Candidate Schema、Digest、Duplicate 和 Conflict。
- Secret、PII、Prompt Injection 和 ReferenceOnly。
- Scope、Repository Revision、Role Budget 和 Read Set。
- Candidate 不进入默认 Context。
- Retrieval 排序可重复且语义 Reranker 不扩大 Eligibility。
- Compact/Resume 后重新检索和 Drift。
- 多仓同名知识、公共层 Owner 和 Repository 移除。
- Obsidian 单向投影和 Human 修改 Proposal。
- 平台 Memory 不能作为 Evidence。
- TTL、Tombstone、Index Rebuild 和 Purge。

## 19. 初始版本范围

- 实现 Working Memory、MemoryCandidate、Policy、Retrieval Index 和 Selection Digest。
- 提供 `memory-curator` Skill 和 Learning Curator Role 配置。
- 复用 Knowledge、Rule、Instruction 和 Skill 的 Candidate/Promotion 流程。
- 使用 Metadata + Lexical Retrieval，不引入 Vector Database。
- 支持多仓 Scope、Wiki Reference 和 Obsidian Projection。
- Codex/Claude 平台 Memory 只做 Capability Observation，不做双向同步。
- 自动生成 Candidate，不自动 Promotion。
- 不保存完整 Transcript、隐藏推理或企业 Wiki 原文。
