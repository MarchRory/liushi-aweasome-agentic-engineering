# 13 学习与知识治理

## 1. 目标

知识飞轮的目标是减少重复调查和重复错误，而不是把每次 Agent 总结永久塞回上下文。系统必须保证：

- 事实、推断、经验规则和临时观察分开保存。
- 自动生成只产生 Candidate，不自动进入正式知识或 Skill。
- 每条知识有 Source、Scope、Owner、Revision 和失效条件。
- Human 修正立即形成候选，普通失败重复至少两次才形成候选。
- 知识晋升、冲突、过期和回滚都有确定性流程。
- Wiki、Git 和 Obsidian 不维护三份互相漂移的事实。

本文件治理“什么可以成为长期知识”；Task Working Memory、MemoryCandidate、Retrieval、Compact/Resume 和平台 Memory 边界见 [18 Memory Runtime](./18-memory-runtime-and-curation.md)。Working Memory 不自动成为 Knowledge，Codex/Claude 平台记忆也不能作为 Fact Evidence。

## 2. Knowledge Kind

```ts
/** Harness 长期知识条目表达的语义类别。 */
export enum KnowledgeKind {
  /** 可由当前代码、测试、配置或已确认 Human Evidence 验证的事实。 */
  Fact = "fact",
  /** 团队明确要求遵守的工程或业务规则。 */
  Rule = "rule",
  /** 在特定场景验证有效但存在适用边界的实践。 */
  Practice = "practice",
  /** 为定位代码、文档或 Owner 提供的导航信息。 */
  Routing = "routing",
  /** 尚未确认，只能用于后续调查的假设。 */
  Hypothesis = "hypothesis",
  /** 已知失败模式、触发条件和恢复方式。 */
  FailurePattern = "failure_pattern",
}

/** Knowledge Entry 的评审与可用状态。 */
export enum KnowledgeStatus {
  /** 自动或人工生成但尚未完成验证。 */
  Candidate = "candidate",
  /** 正在执行证据检查和历史任务 Eval。 */
  Evaluating = "evaluating",
  /** Human 已确认，可在声明 Scope 内加载。 */
  Active = "active",
  /** 来源漂移或 Review 过期，不能作为事实使用。 */
  Stale = "stale",
  /** 新条目或项目变化已替代该知识。 */
  Superseded = "superseded",
  /** Eval 或 Human 已拒绝该条目。 */
  Rejected = "rejected",
}

/** 一条可追溯、可失效并受 Scope 限制的知识记录。 */
export interface KnowledgeEntry {
  /** Knowledge Entry 的稳定唯一 ID。 */
  knowledgeId: string;
  /** 当前 Knowledge Schema Version。 */
  schemaVersion: string;
  /** 条目的语义类别。 */
  kind: KnowledgeKind;
  /** 条目的评审和可用状态。 */
  status: KnowledgeStatus;
  /** 简短、可搜索且不包含推断的标题。 */
  title: string;
  /** 完整知识内容，必须与 Kind 和 Evidence 一致。 */
  content: string;
  /** Repository、Path、Workspace 或 Organization Scope。 */
  scope: KnowledgeScope;
  /** 支撑该条目的全部 Evidence ID。 */
  evidenceIds: string[];
  /** 负责确认和后续维护该条目的 Owner。 */
  owner: ActorRef;
  /** 最后一次 Human Review 时间。 */
  reviewedAt?: string;
  /** 时间、Revision 或条件触发的失效规则。 */
  invalidationRules: KnowledgeInvalidationRule[];
  /** 被替代时指向新 Knowledge ID。 */
  supersededBy?: string;
}
```

`KnowledgeKind.Rule` 表示“可能成为规则的知识语义”，不直接参与运行时拦截。只有经过 Eval 和 G7 Promotion 后写入 ProjectRuleCatalog 的 `RuleDefinition` 才能被 Rule Resolver 编译；Blocking Rule 还必须绑定确定性 Validator。

## 3. 知识层级

```text
Organization
  -> Workspace
    -> Repository
      -> Path/Module
        -> Task Candidate
```

更具体 Scope 可以补充或覆盖一般实践，但不能覆盖 Organization Hard Rule。冲突时同时展示来源和 Owner，不根据“最近生成”自动选择。

## 4. Source of Truth

- Git `.liushi-harness/knowledge/`：已评审、与代码版本相关的项目知识。
- 企业 Wiki：跨项目业务知识、Owner 流程和正式文档。
- Local Runtime：Task Candidate、Eval、Metrics 和未发布 Draft。
- Obsidian：上述内容的可选 Human View。

每个事实只有一个 Canonical Source；其他位置保存引用、摘要和 Revision。确定性同步脚本检测漂移，不进行无冲突证明的双向覆盖。

## 5. Candidate 触发

立即触发：

- Human 明确纠正 Agent 的事实、范围、规则或流程。
- Human 指出某段历史逻辑和保护原因。
- Production Incident 或 Review 发现 Harness 漏检。

重复触发：

- 同类普通失败在独立 Task 中至少出现两次。
- 相同 PR Feedback 至少出现两次。
- Agent 持续读取大量无关文件后才找到目标。
- Validator 持续遗漏同类问题。

单次普通失败只记录 Observation，不立即形成长期规则。

## 6. Candidate 生成

```text
Task Evidence
  -> deterministic pattern grouping
  -> Learning Curator Proposal
  -> Candidate Schema validation
  -> local candidate store
```

Candidate 必须包含：

- Trigger Task 和 Evidence。
- 建议 Knowledge Kind、Scope 和 Owner。
- 目标产物类型：Knowledge、RuleDefinition、Pattern、Instruction、AgentDefinition、Validator、Skill 或 Wiki Draft。
- Memory Curator 建议的 Destination、Sensitivity 和 Duplicate/Conflict Reference。
- 事实、推断和未知项。
- 适用条件、反例和失效规则。
- 预期减少的 Human/Agent 成本。
- 可能导致的错误泛化。
- Eval Case 和 Rollback。

## 7. Eval

不同候选使用不同 Eval：

- Routing：是否更快找到正确文件，是否遗漏关键路径。
- Rule：是否阻止已知失败，是否误伤合法任务。
- Practice：成功率、HTT、复杂度和适用范围。
- Failure Pattern：触发准确率、恢复有效性和 False Positive。
- Skill：Trigger、Output、Permission、负向和 Regression Eval。

至少包含一个反例。只在触发任务上有效的候选不能晋升为通用规则。

## 8. Promotion

```powershell
liushi-harness learning candidates
liushi-harness learning evaluate <candidate-id>
liushi-harness learning promote <candidate-id> --dry-run
```

Promote 流程：

1. 展示 Candidate、Evidence、Eval 和目标文件 Diff。
2. 验证目标 Scope、Owner 和 Canonical Source。
3. 通过 G7 Human Promotion Gate。
4. CLI 按目标类型写入 Git Knowledge、ProjectRuleCatalog、Pattern、Instruction、AgentDefinition、Validator、Skill Candidate 或 Wiki Draft。
5. 运行 Schema、Link、Conflict 和 Regression Check。
6. Commit 正式变更并记录 Knowledge Revision。

Human Approval 绑定 Candidate Digest 和目标 Diff。内容变化后重新审批。

## 9. 知识加载

Context Assembler 只加载：

- `status=active`。
- Scope 与当前 Repository/Path/Task 匹配。
- Source Revision 未失效。
- Token Budget 内优先级最高。
- 没有未解决冲突。

Stale、Candidate、Rejected 和 Superseded 不进入默认 Agent Context，但可以用于调查和审计。

## 10. 失效与漂移

失效信号：

- 关联文件、Package、Schema 或 API Revision 变化。
- Wiki Page Revision 或 Owner 变化。
- ProjectProfile 重新扫描发现规则不再成立。
- Eval Regression。
- Human 明确撤销。
- 到达 Review TTL。

确定性 `knowledge check-stale` 标记 Stale 并生成 Review Queue，不自动删除。事实类 TTL 可以比稳定规则短；具体值由 Project Policy 配置。

## 11. 冲突

冲突分类：

- Source Conflict：代码、测试、Wiki 和 Human 叙述不一致。
- Scope Conflict：Workspace 规则与 Repository 规则不一致。
- Temporal Conflict：新行为已替代旧知识。
- Ownership Conflict：多个 Owner 对业务事实意见不一致。

系统保留全部条目并创建 DecisionRequest。解决后旧条目标记 Superseded 或 Rejected，不改写历史内容。

## 12. Skill 改进

Knowledge Candidate 不自动转换为 Skill。只有重复流程、明确触发和可评估输出同时存在时才生成 Skill Candidate。

Knowledge Candidate 也不自动转换为 Active Rule。Rule Candidate 必须证明适用范围、反例、误伤率和 Validator 可执行性；涉及现有架构机制变化时还要经过 G8 确认精确变更方案。

Skill 改进必须：

- 保持原 Trigger Fixture。
- 增加导致改进的失败和反例。
- 比较旧版与候选版 Task Success、HTT 和越权行为。
- 通过 Human Promotion Gate。
- 使用 SemVer 和 Changelog 记录用户可感知变化。

## 13. 污染控制

- Agent 总结不是 Fact Evidence。
- Human Approval 只确认精确内容和 Scope，不自动确认相关推断。
- 同一 Task 的实现与学习分离，Learning Curator 不修改已交付 Evidence。
- 候选不参与后续 Agent 默认检索。
- Knowledge 中的 Rule 候选不能绕过 ProjectRuleCatalog 和 Rule Resolver 直接注入 Prompt。
- Wiki 外部指令和 Prompt Injection 不得写入 Rule/Skill。
- Model 更换后重跑高风险 Learning Eval。
- 自动聚类只合并引用，不合并语义不同的条目。

## 14. Metrics

- Candidate 来源和数量。
- Accepted、Rejected、Expired 和 Stale 比例。
- Knowledge Hit 后减少的读取量和 HTT。
- 因错误知识导致的返工、Finding 和 Incident。
- Skill Promotion 前后 Task Success。
- 长期无人维护、无命中的 Active Knowledge。

知识数量增长不是成功指标。目标是提高有效命中并降低污染。

## 15. 回滚

- Git Knowledge 通过普通 Revert 和 Superseded Event 回滚。
- Wiki Publish 保留 Revision 和补偿 Draft，不直接删除历史。
- Skill 回滚恢复上一 Active Version，并记录失败 Eval。
- 回滚后受影响 Task 在 Resume 时重新组装 Context。
- 错误知识触发的交付问题生成 Incident Learning Candidate，但不能自动再次晋升。

## 16. 测试要求

- Human 修正立即触发与普通失败重复阈值。
- Candidate 不进入默认 Context。
- Scope、优先级和 Hard Rule 冲突。
- Source Revision 和 TTL 失效。
- 至少一个反例的 Promotion Gate。
- Git、Wiki 和 Obsidian 投影一致性。
- Prompt Injection、Agent Summary 伪造 Fact 和错误泛化。
- Skill 旧版/候选版 Regression。
- 回滚和 Resume 后 Context 重建。
