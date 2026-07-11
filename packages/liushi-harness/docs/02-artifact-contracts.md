# 02 Artifact 契约

## 1. 设计目标

Artifact 是 Human、Agent、CLI 和不同执行器之间的稳定交接协议。聊天文本可以帮助理解，但不能作为任务状态、审批或完成证据的唯一来源。

所有 Artifact 必须：

- 有 Schema Version、Artifact ID、Workspace ID 和 Task ID。
- 区分事实、推断和未知项。
- 通过 EvidenceRef 指向来源。
- 使用规范序列化结果计算 Digest。
- 变更时保留父版本和生成者。
- 在进入正式状态前通过 CLI Schema 和 Policy 校验。

## 2. 公共信封

```ts
/** Artifact 在受控生命周期中的状态。 */
export enum ArtifactStatus {
  /** Artifact 仍在编辑，不能作为 Gate 或执行依据。 */
  Draft = "draft",
  /** Artifact 已提交给 CLI 校验，但尚未获得 Human 决策。 */
  Proposed = "proposed",
  /** Artifact 对应 Digest 已获得所需 Human Approval。 */
  Approved = "approved",
  /** Human 或 Policy 已拒绝该 Artifact。 */
  Rejected = "rejected",
  /** 更新版本已经替代该 Artifact，保留它仅用于审计。 */
  Superseded = "superseded",
}

/** 保存 Artifact Payload 及其版本、来源和完整性信息的规范信封。 */
export interface ArtifactEnvelope<TPayload> {
  /** 当前 Artifact Schema 的语义版本。 */
  schemaVersion: string;
  /** 经过 Artifact Registry 校验的开放类型标识符。 */
  artifactType: string;
  /** Artifact 跨 Revision 保持稳定的唯一标识符。 */
  artifactId: string;
  /** Artifact 所属 Workspace。 */
  workspaceId: string;
  /** Artifact 所属 Task。 */
  taskId: string;
  /** 同一 Artifact 内严格递增的 Revision。 */
  revision: number;
  /** 上一个 Revision 的 Digest；首个 Revision 不存在。 */
  parentDigest?: string;
  /** Artifact 当前生命周期状态。 */
  status: ArtifactStatus;
  /** 使用 ISO 8601 UTC 表示的创建时间。 */
  createdAt: string;
  /** 创建该 Revision 的 Human、Agent 或 System Actor。 */
  createdBy: ActorRef;
  /** 由具体 Artifact Schema 定义的业务内容。 */
  payload: TPayload;
  /** 对规范 JSON 计算的 SHA-256 Digest。 */
  digest: string;
}
```

Digest 使用规范 JSON 计算，计算时排除 `digest` 字段。首月采用 SHA-256，用于绑定版本和发现错误，不宣称具备防篡改审计系统的安全等级。

## 3. Evidence 与 Claim

```ts
/** Evidence 的来源类别。 */
export enum EvidenceKind {
  /** 来自指定 Revision 的仓库文件。 */
  File = "file",
  /** 来自 Git Commit、Diff、Blame 或历史记录。 */
  Git = "git",
  /** 来自可重放的确定性命令及其输出。 */
  Command = "command",
  /** 来自测试、Lint、Typecheck 或其他 Validator。 */
  Test = "test",
  /** 来自企业或公开 Wiki 页面。 */
  Wiki = "wiki",
  /** 来自 Issue、Ticket 或需求管理系统。 */
  Ticket = "ticket",
  /** 来自已识别 Human 的明确陈述或决策。 */
  Human = "human",
}

/** Claim 对已收集 Evidence 的解释类别。 */
export enum ClaimClassification {
  /** 可由一个或多个 EvidenceRef 直接验证的事实。 */
  Fact = "fact",
  /** 基于 Evidence 推导但尚未被直接确认的判断。 */
  Inference = "inference",
  /** 当前 Evidence 无法回答且可能影响实现的问题。 */
  Unknown = "unknown",
}

/** 指向可复查来源的稳定 Evidence 引用。 */
export interface EvidenceRef {
  /** Evidence 在当前 Workspace 内的唯一标识符。 */
  evidenceId: string;
  /** Evidence 的来源类别。 */
  kind: EvidenceKind;
  /** 产生 Evidence 的仓库、Connector、Validator 或 Actor。 */
  source: string;
  /** 能够重新定位来源的路径、URL、Commit 或命令记录 ID。 */
  locator: string;
  /** 来源支持 Revision 时记录的不可变版本。 */
  revision?: string;
  /** 使用 ISO 8601 UTC 表示的采集时间。 */
  capturedAt: string;
  /** 对实际采集内容计算的 Digest，不能用 Agent 摘要替代。 */
  contentDigest?: string;
}

/** 带证据分类的业务或技术陈述。 */
export interface Claim {
  /** 供 Human 和 Agent 阅读的完整陈述。 */
  text: string;
  /** 该陈述当前属于事实、推断还是未知。 */
  classification: ClaimClassification;
  /** 支撑该陈述的 Evidence ID；Unknown 可以为空。 */
  evidenceIds: string[];
}
```

规则：

- `fact` 至少关联一个 EvidenceRef。
- `inference` 必须说明依据，不得伪装成项目规则。
- `unknown` 必须进入 Requirement 问题、Risk 或 DecisionRequest。
- Wiki 内容只能证明“Wiki 如此描述”，不能单独证明代码当前实际行为。

## 4. ProposalEnvelope

所有 Agent 输出统一为 Proposal，不直接写 Artifact：

```ts
/** Agent 向确定性 CLI 提交的结构化提案信封。 */
export interface ProposalEnvelope<TProposal> {
  /** Proposal Schema 的语义版本。 */
  schemaVersion: string;
  /** 本次 Proposal 的唯一标识符。 */
  proposalId: string;
  /** Proposal 所属 Workspace。 */
  workspaceId: string;
  /** Proposal 所属 Task。 */
  taskId: string;
  /** 经 Role Registry 校验的开放角色标识符。 */
  role: string;
  /** Proposal 计划创建或更新的 Artifact 类型。 */
  targetArtifactType: string;
  /** Proposal 基于的 Artifact Digest，用于阻止覆盖新 Revision。 */
  baseArtifactDigest?: string;
  /** 生成 Proposal 的执行器、模型和策略记录。 */
  modelExecution: ModelExecutionRecord;
  /** 等待 CLI 校验和提交的业务内容。 */
  proposal: TProposal;
  /** Proposal 使用的全部 Evidence。 */
  evidence: EvidenceRef[];
  /** 尚未解决且可能影响提交的 Claim。 */
  unresolved: Claim[];
  /** Agent 请求 Human 处理的阻断性决策。 */
  requestedDecisions: DecisionRequestDraft[];
}
```

CLI Commit Protocol：

1. 校验 Proposal Schema。
2. 校验 Workspace、Task、Role 和 Base Digest。
3. 重新读取关键 Evidence，防止使用过期 Revision。
4. 执行 Policy 和 Gate Evaluation。
5. 生成新 Artifact Revision 和 Digest。
6. 追加事件并原子更新 Snapshot。
7. 返回稳定 JSON 结果。

任何一步失败都不得产生部分正式 Artifact。

### 4.1 派生运行时视图

`ContextBundle`、角色 Prompt 和 Human Review 页面是从已提交 Artifact、当前 Revision 和 EvidenceRef 派生的临时视图，不是新的规范状态。它们必须记录输入 Digest；任一输入变化后旧视图失效并重新生成，不能被反向写回覆盖源 Artifact。

## 5. 核心 Artifact

### 5.1 WorkspaceGraph

描述多仓、公共层和知识源关系：

- Repository ID、路径、Revision 和 Role。
- `application`、`shared-infra`、`library`、`docs` 等类型。
- 依赖边、所有权、读写策略和验证命令。
- Wiki、Issue Tracker 和其他 Connector 引用。
- 当前 Task 的 Read Set 和 Write Set。

首月不根据 AI 推断自动修改 Write Set。

### 5.2 ProjectProfile

描述一个仓库的工程与业务约束：

- Package Manager、语言、框架和构建方式。
- Typecheck、Lint、Test、Build 和 E2E 命令。
- 目录所有权和保护路径。
- 强制规则、主流模式、遗留模式和未知项。
- 历史业务敏感区域和所需审批人。
- Profile 的扫描 Revision 和 Human Review 时间。

### 5.3 RequirementContract

必须包含：

- 问题、目标和非目标。
- 用户可观察行为和验收标准。
- 已确认范围、涉及仓库和禁止范围。
- 边界情况、兼容性和未知项。
- Evidence 和 Human 回答。

进入实现前 `unknown` 必须被解决、接受为显式风险，或使任务停在 `WAITING_HUMAN`。

### 5.4 BusinessLogicChangeContract

仅在触及历史逻辑、公共层或 Policy 标记区域时要求：

- 当前行为是什么。
- 当前行为的代码、测试、Git、Wiki 和 Human 证据。
- 哪些是事实、推断和未知。
- 计划行为和精确差异。
- 受影响用户、调用方、仓库和回滚路径。
- 保持不变的业务不变量。
- Human 对“当前逻辑”和“改动方案”的明确批准。

批准必须绑定该 Artifact Digest。Artifact 内容变化后原审批自动失效。

### 5.5 PlanRisk

- 实现步骤、文件或模块范围。
- 依赖关系和执行顺序。
- 风险项、触发条件、影响、缓解和验证。
- Read Set、Write Set 和所需 Gate。
- 测试计划和回滚计划。
- 可并行与不可并行的工作。
- Applicable Rule ID、Architecture Mechanism 和预期 Compliance Validator。

### 5.6 DecisionRequest

一个请求只表达一个阻断性决策：

- 决策问题和原因。
- 可选项及其影响。
- 推荐项，但不能替 Human 决定。
- 关联 Artifact Digest、Evidence 和截止状态。
- 决策后恢复到哪个 State。

Human Battle 默认最多连续提出五个会改变实现的问题，并且一次只提出一个问题。

### 5.7 ApprovalRecord

```ts
/** Human 对一个 Gate 的明确决策。 */
export enum ApprovalDecision {
  /** 允许 Artifact Digest 对应的精确动作继续执行。 */
  Approved = "approved",
  /** 拒绝当前 Artifact 或动作。 */
  Rejected = "rejected",
  /** 接受指定验证缺失产生的剩余风险。 */
  Waived = "waived",
}

/** 将 Human 决策绑定到精确 Gate 和 Artifact Digest 的审计记录。 */
export interface ApprovalRecord {
  /** Approval 的唯一标识符。 */
  approvalId: string;
  /** 经 Gate Registry 校验的 Gate 标识符。 */
  gate: string;
  /** 被审批 Artifact 的稳定 ID。 */
  artifactId: string;
  /** 审批所绑定的不可变 Artifact Digest。 */
  artifactDigest: string;
  /** Human 做出的决策。 */
  decision: ApprovalDecision;
  /** 做出决策的已识别 Human Actor。 */
  actor: ActorRef;
  /** 拒绝或 Waive 时的必要原因。 */
  reason?: string;
  /** 使用 ISO 8601 UTC 表示的决策时间。 */
  createdAt: string;
}
```

审批不可被 Agent 生成。首月身份来源可以是本机用户、Git Identity 和显式输入的组合，不提供密码学签名；企业可以通过 Connector 扩展审批身份。

### 5.8 EvidenceBundle

Review-ready 前必须包含：

- Requirement 和 Plan Digest。
- Business Logic Contract Digest，如果适用。
- Base Revision、最终 Revision 和完整 Diff 摘要。
- 执行过的验证、工具版本、退出码和输出引用。
- 未执行或失败的必需验证及 Waiver。
- 风险覆盖、剩余风险和回滚说明。
- Agent、模型、Reasoning 和执行器记录。
- Human Approval Record 引用。
- ApplicableRuleBundle Digest、RuleComplianceReport 和有效 Rule Exception。
- InstructionBundle、Memory Selection、AgentDefinition 和 AgentInstance Digest。

Evidence Bundle 不能只保存 Agent 总结，必须保存可复查的命令和来源引用。

### 5.9 LearningCandidate

- 触发来源：明确 Human 修正，或普通失败重复至少两次。
- 候选类型：Memory、知识、Project Rule、Architecture Mechanism、Instruction、Agent、Skill、Validator 或 Policy Threshold。
- Evidence、适用范围、反例和失效条件。
- 预期收益和潜在副作用。
- Eval Case 和比较结果。
- 状态：`candidate`、`evaluating`、`accepted`、`rejected`、`expired`。

```ts
/** Learning Candidate 的评估和晋升状态。 */
export enum LearningCandidateStatus {
  /** 候选刚生成，尚未开始评估。 */
  Candidate = "candidate",
  /** 正在运行历史任务和负向 Eval。 */
  Evaluating = "evaluating",
  /** Human 已接受候选，允许确定性 CLI 执行晋升。 */
  Accepted = "accepted",
  /** Human 或 Eval 已拒绝候选。 */
  Rejected = "rejected",
  /** 候选因项目或证据变化不再适用。 */
  Expired = "expired",
}
```

候选被接受后仍由确定性 CLI 写入目标文件；Wiki 正式写入和 Skill 晋升需要 Human Gate。

### 5.10 ProjectRuleCatalog

保存一个 Scope 内经 Human 确认的 Active、Candidate、Stale 和 Superseded Rule 引用：

- Rule ID、Version、Digest、Category、Enforcement 和 Scope。
- Selector、Owner、Evidence、Validator 和 Invalidation Rule。
- Approved、Legacy、Forbidden 和 Unknown Pattern 引用。
- Catalog Revision、Human Review 和 Source Revision。

Catalog 只保存索引和规范字段；详细 Guidance 和 Fixture 按 Rule 目录组织。

### 5.11 ArchitectureMechanismProfile

描述业务代码应该如何接入项目现有机制：

- 模块分层、依赖方向、数据流和目录责任。
- API、State、Error、Auth、Feature Flag、Design System 和 Observability 机制。
- Approved/Legacy Pattern、Owner、Evidence 和适用路径。
- Public Contract、兼容边界和机制失效条件。

AI 扫描只能提出 Profile Proposal。Human 确认后才能作为 Rule Resolution 输入。

### 5.12 ApplicableRuleBundle

由确定性 Rule Resolver 针对 Task 和 Write Set 派生：

- Rule ID、Version、Digest、Enforcement 和来源 Scope。
- Architecture Mechanism、Approved Example 和必需 Validator。
- Task、Repository、Base Revision、Write Set 和 Bundle Digest。
- 冲突、Unknown、缺失 Capability 和所需 Human Gate。

PlanRisk、Implementation 和 Verification 必须绑定同一 Bundle Digest。Rule、Write Set 或 Revision 变化后旧 Bundle 失效。

### 5.13 RuleComplianceReport

将每条 Applicable Rule 关联到目标文件、Validator、Evidence 和最终状态：

- `compliant`、`non_compliant`、`undetermined` 或 `excepted`。
- Blocking Violation、ApprovalRequired Finding 和 Advisory Finding。
- Rule Exception ID、Scope、Owner 和 Expiry。
- Report 对应的 Target Revision 和 RuleBundle Digest。

未解决 Blocking Violation 或缺失必需 Compliance Evidence 时不能生成 Review-ready。

### 5.14 ArchitectureMechanismChangeContract

当 Task 引入、替换或绕过现有项目机制时要求：

- 当前机制、Evidence、Owner 和业务/技术原因。
- 计划变化、替代项、影响面、迁移和兼容策略。
- 更新哪些 Rule、Validator、Pattern 和项目文档。
- 验证、发布和回滚计划。

涉及业务行为时同时要求 BusinessLogicChangeContract；Architecture Owner 和 Business Reviewer 分别确认自己的责任范围。

### 5.15 InstructionBundle

由确定性 Instruction Resolver 针对 Repository、Path、Task 和 Role 派生：

- Instruction ID、Version、Purpose、Scope 和 Source Digest。
- Statement、Reference ID、Content Budget 和 Target Adapter。
- Task、Repository、Path、Revision 和 Bundle Digest。
- 冲突、Stale Reference 和平台降级信息。

长期平台文件只投影 Repository/Path Instruction；Task Instruction 仅进入运行时 Bundle。

### 5.16 InstructionProjectionManifest

记录 Canonical Instruction 到平台文件的生成关系：

- Adapter、Target Path、Source ID/Digest 和 Generated Digest。
- Existing File Base Digest、Ownership Mode 和 Projection Plan ID。
- Template/Adapter Version、Applied At 和 Applied By。
- Drift、Conflict、Three-way Diff 和 Uninstall 信息。

Manifest 不等于 Target File；Human 修改 Target 后必须停止自动更新。

### 5.17 MemorySelection

保存一次 Context Assembler 实际选择的 Working Memory 和 Active Knowledge 引用：

- Task、Role、Read Set、Repository Revision 和 Retrieval Policy。
- Entry ID、Source、Scope、Digest、Ranking Reason 和 Token Cost。
- Empty、Filtered、Stale 和 Platform Assist Observation。
- Selection Digest 和生成时间。

Platform Memory Claim 不能直接进入 Selection，除非先重新取得正式 Evidence。

### 5.18 MemoryCandidate

保存 `memory-curator` 对一条信息的目标分类 Proposal：

- Destination、Sensitivity、Scope、Owner 和 Invalidation Rule。
- Claim、Evidence、Trigger、Duplicate 和 Conflict Reference。
- Validation、Eval、G7 Promotion 和最终目标 Diff。
- Rejected/Discard 时的确定原因和最小审计记录。

MemoryCandidate 默认不进入后续 Agent Context。

### 5.19 AgentInstance

由 Agent Registry、Task Risk、Executor Capability 和 ModelPolicy 解析：

- AgentDefinition ID/Version/Digest 和 Role ID。
- Resolved Model、Reasoning、Permission、Tool、Connector 和 Skill。
- ContextPolicy、MemoryAccess、Instruction/Rule/Memory Selection Digest。
- Input Artifact、Output Schema、Timeout、Retry、Gate 和 Eval Version。
- Adapter Projection、Session/Invocation ID 和 Fallback Reason。

AgentDefinition 或任何绑定发生变化后必须生成新的 AgentInstance Digest。

## 6. ModelExecutionRecord

```ts
/** Harness 用于模型路由的能力层级。 */
export enum ModelTier {
  /** 当前已验证的 SOTA 模型，服务顶层协调和高风险判断。 */
  Frontier = "frontier",
  /** 在质量、延迟和成本之间平衡的日常模型。 */
  Balanced = "balanced",
  /** 用于可验证分类、索引和归纳的高吞吐模型。 */
  Fast = "fast",
}

/** 记录一次 Agent 调用实际使用的执行器、模型和 Policy。 */
export interface ModelExecutionRecord {
  /** 执行本次调用的 Executor Adapter ID。 */
  executor: string;
  /** 经 Role Registry 校验的开放角色标识符。 */
  role: string;
  /** Model Routing Policy 请求的模型层级。 */
  requestedTier: ModelTier;
  /** Executor 最终解析并实际使用的模型 ID。 */
  resolvedModel: string;
  /** 执行器支持时记录的 Reasoning Effort。 */
  reasoningEffort?: string;
  /** 决定本次路由的 Model Policy Version。 */
  policyVersion: string;
  /** 非顶层角色发生显式回退时的原因。 */
  fallbackReason?: string;
  /** 使用 ISO 8601 UTC 表示的开始时间。 */
  startedAt: string;
  /** 调用正常或异常结束时的时间。 */
  completedAt?: string;
}
```

顶层 Orchestrator 的 `fallbackReason` 不得用于静默降级。Frontier 不可用时，任务进入 `WAITING_HUMAN`。

## 7. Schema 演进

- Artifact 使用独立 Schema Version，不与 npm Package Version 强绑定。
- Patch 版本只能增加可选字段或修正文档。
- 删除、重命名、语义变化必须提升 Major Version。
- Store 读取旧版本时先执行纯函数 Migration，再进入 Core。
- Migration 必须保留原文件备份、事件记录和 `--dry-run` 差异。
- 无法迁移时进入只读恢复模式，不能丢弃未知字段继续写入。

## 8. 待后续方案确认

- Artifact JSON 与 Markdown 人类视图的生成和双向关系。
- 企业审批身份和签名扩展。
- Wiki Draft 的通用 Patch Contract。
- 大型 Evidence 输出的归档与保留周期。
- 跨仓 Saga 的补偿 Artifact。
