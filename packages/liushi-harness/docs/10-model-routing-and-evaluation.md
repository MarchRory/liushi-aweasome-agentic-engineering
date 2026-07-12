# 10 模型路由与评估

## 1. 目标

模型路由必须保证最重要的决策使用最强可用模型，同时让高频、可验证子任务使用更高效的模型。选择规则由 Policy 和 Eval 驱动，不散落在 Prompt 中。

用户约束：

- 排除 Claude 系列模型。
- 顶层 Orchestrator 必须使用当前已验证 SOTA。
- 其他 Agent 可以按风险和任务形态选择模型。
- 顶层模型不可用时不允许静默降级。

### 1.1 当前实现状态

**状态：设计完成，尚未实现。** 当前代码没有 Model Registry、Role Router、自动升级、成本策略或 Eval Dataset Runner；模型选择仍由外部 Coding Agent 会话负责。本章中的模型名称和能力只能作为可更新 Policy 示例，正式实现必须通过当时可用模型的实时能力探测与 Eval，不能硬编码当前 SOTA 名称。

## 2. 当前 OpenAI 基线

截至 2026-07-11，OpenAI 官方模型指南将 `gpt-5.6-sol` 定义为旗舰能力模型，`gpt-5.6` Alias 指向 Sol；`gpt-5.6-terra` 是平衡型，`gpt-5.6-luna` 是高吞吐型。[OpenAI Latest Model Guide](https://developers.openai.com/api/docs/guides/latest-model)

首个默认映射：

| Tier     | Resolved Model  | 用途                           |
| -------- | --------------- | ------------------------------ |
| Frontier | `gpt-5.6-sol`   | 顶层协调、高风险方案、关键验证 |
| Balanced | `gpt-5.6-terra` | 普通实现、Context、日常验证    |
| Fast     | `gpt-5.6-luna`  | 分类、索引、去重、低风险归纳   |

这只是经当前文档确认的初始值。Harness 保存语义 Tier 和已验证映射，不把某个模型 ID 永久写死为“永远 SOTA”。

## 3. Reasoning

```ts
/** Adapter 可以映射到执行器的标准 Reasoning 深度。 */
export enum ReasoningEffort {
  /** 不进行额外推理，适用于确定性转换。 */
  None = "none",
  /** 延迟敏感且判断空间很小。 */
  Low = "low",
  /** 普通工程任务的平衡起点。 */
  Medium = "medium",
  /** 复杂方案、实现和验证。 */
  High = "high",
  /** 高风险问题的深度审查。 */
  ExtraHigh = "xhigh",
  /** 执行器支持时用于极少数质量优先任务。 */
  Maximum = "max",
}

/** 模型调用是否启用平台提供的额外质量优先执行模式。 */
export enum ModelExecutionMode {
  /** 使用标准单次模型执行。 */
  Standard = "standard",
  /** 平台支持时投入更多模型工作以提高困难任务可靠性。 */
  Pro = "pro",
}
```

SOTA Model 与最高 Reasoning 不是同一概念。Orchestrator 固定 Frontier，但普通步骤默认 `high`；仅在明确风险触发时升级 `xhigh/max` 或 Pro Mode。

## 4. Role 默认路由

| Role                        | Model Tier | Reasoning      | 备注                                 |
| --------------------------- | ---------- | -------------- | ------------------------------------ |
| Orchestrator                | Frontier   | High           | 永不自动降级                         |
| Requirement Battle          | Frontier   | High           | 错误会污染后续所有阶段               |
| Solution Risk Reviewer      | Frontier   | High           | 历史逻辑和影响面属于高错误成本       |
| Context Scout               | Balanced   | Medium         | 大量只读检索，结果可由 Evidence 校验 |
| 普通 Implementation         | Balanced   | Medium         | Contract 清晰、单仓、R1              |
| 高风险 Implementation       | Frontier   | High           | 历史逻辑、公共层、跨仓、权限         |
| 普通 Independent Verifier   | Balanced   | High           | 使用独立 Context                     |
| 高风险 Independent Verifier | Frontier   | High/ExtraHigh | Critical Finding 不允许降级          |
| Learning Curator            | Balanced   | Medium         | 只生成候选                           |
| 索引、聚类、去重            | Fast       | Low            | 必须有确定性后验检查                 |

表格是 ModelPolicy 基线，不直接生成平台 Agent。Active AgentDefinition 引用 ModelPolicy ID，Runtime 解析实际模型后生成 AgentInstance Digest；完整绑定见 [19 Agent Registry](./19-agent-registry-and-platform-rendering.md)。

## 5. Model Policy

```yaml
schemaVersion: "1.0.0"
deniedModelPatterns:
  - "(?i)^claude(?:-|$)"
tiers:
  frontier:
    provider: openai
    model: gpt-5.6-sol
  balanced:
    provider: openai
    model: gpt-5.6-terra
  fast:
    provider: openai
    model: gpt-5.6-luna
roles:
  orchestrator:
    tier: frontier
    reasoning: high
    allowDowngrade: false
```

Policy 中 Pattern 在加载时编译和测试。执行器返回的实际模型必须再次匹配 Deny Policy，不能只检查请求值。

## 6. 路由算法

```text
Role Default
  -> Task Risk
  -> Artifact/Gate Criticality
  -> Executor Capability
  -> Denied Model Check
  -> Eval-approved Candidate
  -> Resolved Model Record
```

优先级：

1. Hard Deny 和企业 Policy。
2. 顶层 Frontier 不降级规则。
3. 风险升级规则。
4. Role 默认。
5. 成本和延迟优化。

成本永远不能把 R2/R3 或顶层角色降到未通过 Eval 的模型。

## 7. 自动升级条件

满足任一条件时，子 Agent 升级为 Frontier：

- 历史业务逻辑或 BusinessLogicChangeContract。
- 跨仓写入或 Shared Infrastructure 修改。
- Public API、Schema、权限、安全和隐私变化。
- Requirement 与当前行为冲突。
- 两个角色结论冲突。
- Validator 连续失败至少两次。
- Proposal Schema Repair 失败。
- Human 明确请求 Frontier。

模型自报 Confidence 不能触发自动降级；低 Confidence 可以触发升级或 Human DecisionRequest。

## 8. 不可用与回退

### 8.1 顶层 Orchestrator

Frontier Model 不可用时：

- Task 进入 `waiting_human`。
- 展示执行器错误、预计影响和可选动作。
- Human 可以等待、切换已验证 Frontier Provider 或转为手动模式。
- 不允许自动切到 Balanced。

### 8.2 子 Agent

子 Agent 只有在 Role Policy 配置 Fallback 且候选通过同一 Eval Gate 时可以回退。每次回退写入 ModelExecutionRecord 和 EvidenceBundle。

## 9. Eval Dataset

模型不能仅凭公开 Benchmark 晋升。Eval Dataset 按角色维护：

- Requirement：缺失范围、冲突和边界问题。
- Context：事实准确率、Evidence 定位和无关读取量。
- Risk：关键风险召回、错误 Gate 和历史逻辑识别。
- Implementation：Task Success、测试、Diff 质量、Rule Compliance、架构机制复用和范围纪律。
- Verification：Critical Finding Recall、False Positive 和证据质量。
- Learning：候选准确性、污染率和适用范围。

初始版本使用 5 个预登记历史需求和至少 3 个真实任务。后续每个主要角色积累至少 20 个代表性 Fixture 后再进行稳定成本优化。

## 10. 评估指标

| 指标                  | 含义                                     |
| --------------------- | ---------------------------------------- |
| Task Success          | 是否满足 Requirement 和全部必需 Gate     |
| Critical Miss         | 是否漏掉会导致业务、数据或权限问题的风险 |
| Artifact Completeness | Schema 和必需字段是否完整                |
| Evidence Validity     | 引用是否存在、Revision 是否匹配          |
| Scope Discipline      | 是否读取或写入未授权范围                 |
| Rule Compliance       | 是否遵守适用 Rule 和已确认架构机制       |
| Human Touch Time      | Human 实际澄清、审查和返工时间           |
| Rework                | Agent 或 Human 返工轮数                  |
| Latency               | Role 从调用到 Proposal 的墙钟时间        |
| Cost/Usage            | Token、Credit 或企业计费单位             |

Critical Miss、越权写入、Blocking Rule Violation 或伪造 Evidence 是 Hard Failure，不能由成本优势抵消。

## 11. 评估流程

1. 所有角色先使用 Frontier 建立质量基线。
2. 固定 Prompt、Context、Tool 和 Reasoning，只替换一个模型变量。
3. 重放同一 Dataset，记录完整 ModelExecutionRecord。
4. 对候选配置执行负向权限和 Failure Fixture。
5. 比较质量、HTT、延迟和成本。
6. 只有无关键质量回退时才生成 ModelPolicy Candidate。
7. Human 通过 G7 Promotion Gate 后由 CLI 更新 Policy。

不能同时改模型、Prompt、Tool 和 Reasoning 后把提升归因给模型。

## 12. 独立验证

Verifier 使用新鲜 Context 和独立 Role Prompt，避免继承 Implementer 的结论。高风险任务即使 Implementation 已使用 Frontier，也继续使用 Frontier Verifier；“同一模型可能相关性错误”通过独立证据、不同任务指令和确定性 Validator 缓解，而不是用明显更弱模型制造表面多样性。

## 13. Context 与缓存

- 稳定 Project Profile、Policy、Active Rule 元数据和 Role Instruction 使用可缓存前缀。
- Task-scoped ApplicableRuleBundle、InstructionBundle、AgentInstance、Memory Selection、机制引用和 Digest 保持在动态后缀。
- Task Evidence、Diff 和 Human 决策保持在动态后缀。
- Context Assembler 记录输入 Token/Size，不重复注入完整文档。
- Persisted Reasoning 只在执行器明确支持、Task 目标稳定且企业 Policy 允许时启用。
- Verifier 不复用 Implementer 的 Persisted Reasoning。

## 14. SOTA 更新

```powershell
liushi-harness models refresh --dry-run
liushi-harness models evaluate --candidate <model-id>
liushi-harness models promote <evaluation-id>
```

Refresh 只生成候选，不修改 Frontier。Promote 必须：

- 验证官方模型身份和执行器可用性。
- 运行角色级 Regression Eval。
- 展示质量、延迟、成本和不兼容变化。
- 通过 Human Promotion Gate。
- 记录旧映射、回滚命令和 Policy Version。

## 15. 测试要求

- Denied Model Pattern 正向和负向测试。
- Orchestrator Frontier 不可用时进入 WAITING_HUMAN。
- R2/R3 子角色自动升级。
- 未 Eval Fallback 被拒绝。
- 实际模型与请求模型不一致时失败。
- 每次执行记录 Role、Tier、Resolved Model、Reasoning 和 Policy Version。
- 模型升级只修改一个变量的可重复 Eval。
- Verifier Context 与 Implementer 推理隔离。
