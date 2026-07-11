# 04 Policy 与 Human Gates

## 1. 目标

Policy 将团队规则转换为机器可执行约束；Human Gate 负责无法由确定性规则安全决定的高风险授权。两者共同避免两种失败：

- 只靠 Prompt，规则可能被忽略。
- 每一步都询问 Human，自动化收益被审批疲劳抵消。

## 2. Policy 层级

从强到弱：

1. Harness Hard Invariants。
2. Enterprise/Organization Policy，可选。
3. Workspace Policy。
4. Repository Policy。
5. Task Exception。

合并原则：

- 更严格规则获胜。
- Task Exception 不能削弱 Hard Invariant。
- Human Approval 可以授权“需要确认”的操作，不能授权 Policy 标记为 `forbidden` 的操作。
- 冲突无法确定时 Fail Closed，并产生 DecisionRequest。

建议位置：

```text
~/.liushi-harness/policy.yaml
~/.liushi-harness/workspaces/<workspace-id>/policy.yaml
<repo>/.liushi-harness/policy.yaml
```

## 3. 风险模型

风险不能只由模型自报置信度决定。Core 使用确定性事实和 AI Risk Proposal 共同计算：

### 3.1 确定性信号

- 写入仓库数量和路径。
- 是否命中 Protected Path、CODEOWNERS 或历史业务标记。
- Git Diff 类型和公共 API 变化。
- 是否执行外部写、破坏性命令、权限或凭据操作。
- 是否跳过 ProjectProfile 中的必需验证。
- 是否违反 ApplicableRuleBundle、绕过项目机制或扩大 Rule Exception。
- Requirement、Plan、Base Revision 和 Write Set 是否漂移。
- 是否连续失败或出现 Agent 结论冲突。

### 3.2 AI 信号

- 行为变化和影响面分析。
- 代码、Git、Wiki 和 Human 叙述之间的语义冲突。
- 隐含业务不变量。
- 方案替代项与剩余风险。

AI 信号只能提高风险或请求 Human 澄清，不能单独降低确定性规则计算出的风险。

### 3.3 风险等级

| 等级 | 示例                                   | 默认行为                     |
| ---- | -------------------------------------- | ---------------------------- |
| R0   | 只读扫描、状态查询                     | 自动允许                     |
| R1   | 批准范围内的低风险单仓修改             | Sandbox 内允许               |
| R2   | 公共接口、复杂重构、验证不完整         | Human Gate                   |
| R3   | 历史业务逻辑、跨仓写、公共层、安全权限 | Human Gate + Frontier Review |
| R4   | 自动合并发布、不可逆外部操作、越权读取 | 首月禁止或强制独立人工流程   |

## 4. Gate 清单

| Gate                  | 触发条件                                                  | 所需 Artifact               | Human 决策           |
| --------------------- | --------------------------------------------------------- | --------------------------- | -------------------- |
| G0 Managed Files      | 安装、升级、覆盖执行器配置                                | InstallPlan、Diff           | 确认写入             |
| G1 Requirement        | 所有实现任务                                              | RequirementContract         | 确认需求与范围       |
| G2 Business Logic     | 历史逻辑或业务敏感路径                                    | BusinessLogicChangeContract | 确认现状与改动方案   |
| G3 Cross Repo         | Write Set 超过一个仓库                                    | WorkspaceGraph、PlanRisk    | 确认仓库和顺序       |
| G4 Risk Operation     | R2/R3 外部、破坏性、权限操作                              | PlanRisk、Action Proposal   | 确认精确动作         |
| G5 Validation Waiver  | 必需检查失败或无法执行                                    | EvidenceBundle Draft        | 接受剩余风险         |
| G6 Merge/Release      | 合并、发布、部署                                          | Final EvidenceBundle        | Human 执行或明确确认 |
| G7 Governed Promotion | 正式知识、Rule、Instruction、Agent、Skill、Wiki 或 Policy | Candidate、Eval             | 确认晋升             |
| G8 Rule/Architecture  | 临时 Rule 例外或架构机制偏离                              | RuleComplianceReport、Diff  | 确认精确例外或变更   |

所有风险操作都必须经过对应 Human Gate。G2 必须同时确认“当前业务逻辑理解”和“计划改动”，不能只确认代码 Diff。

## 5. Gate Evaluation

```text
事实扫描
  -> Policy 合并
  -> 风险分类
  -> 计算 Required Gates
  -> 查找匹配 Artifact Digest 的 Approval
  -> allow / waiting_human / forbidden
```

评估输出：

```ts
/** Gate Engine 对当前动作的最终处理结果。 */
export enum GateEvaluationResult {
  /** 所需 Policy 与 Approval 均已满足，可以继续。 */
  Allow = "allow",
  /** 缺少一个必须由 Human 处理的决策。 */
  WaitingHuman = "waiting_human",
  /** Hard Invariant 或合并 Policy 明确禁止该动作。 */
  Forbidden = "forbidden",
}

/** Harness 使用的标准风险等级。 */
export enum RiskLevel {
  /** 无副作用的只读动作。 */
  R0 = "R0",
  /** 批准范围内、可验证且可回滚的低风险单仓动作。 */
  R1 = "R1",
  /** 需要 Human 评估的复杂或验证不完整动作。 */
  R2 = "R2",
  /** 历史逻辑、跨仓、公共层、安全或权限相关动作。 */
  R3 = "R3",
  /** 首月禁止或必须脱离 Harness 执行的不可逆动作。 */
  R4 = "R4",
}

/** Gate Engine 的确定性评估结果及其可审计依据。 */
export interface GateEvaluation {
  /** 当前动作是否允许、等待 Human 或被禁止。 */
  result: GateEvaluationResult;
  /** 根据确定性信号和 AI 上调建议得到的风险等级。 */
  riskLevel: RiskLevel;
  /** 当前动作必须满足的全部 Gate ID。 */
  requiredGates: string[];
  /** 已匹配当前 Artifact Digest 的 Approval ID。 */
  satisfiedApprovals: string[];
  /** 解释评估结果的稳定原因列表。 */
  reasons: string[];
  /** 支撑风险和 Gate 判断的 Evidence ID。 */
  evidenceIds: string[];
}
```

同一输入必须产生同一 Gate 结果。时间、用户身份和环境能力必须作为显式输入，不得读取隐藏的进程全局状态。

## 6. 审批协议

Human 审批流程：

1. CLI 展示 Artifact 摘要、Digest、精确动作、风险和推荐项。
2. Human 选择 `approve`、`reject` 或允许的 `waive`。
3. CLI 记录 Actor、时间、原因和 Artifact Digest。
4. Core 重新评估 Gate，不直接信任 UI 返回的“成功”。
5. 执行前再次检查 Digest、Revision 和 Write Set。

以下事件使 Approval 失效：

- 关联 Artifact 内容变化。
- Write Set 扩大。
- Base Revision 变化并影响相关 Evidence。
- Policy 变得更严格。
- Human 主动撤销。

## 7. 历史业务逻辑 Gate

识别来源：

- Repo Policy 中的路径标记。
- ProjectProfile 的业务敏感区域。
- Git 历史显示的兼容修复或回滚记录。
- 测试与代码存在看似冗余但稳定的行为。
- Wiki、Ticket 或 Human 明确指出历史约束。
- Context Scout 发现当前行为与需求存在冲突。

触发后 Agent 只能继续调查，不能写实现。BusinessLogicChangeContract 必须包含：

- 当前行为及可复查证据。
- 事实、推断、未知的区分。
- 计划变化和保持不变项。
- 影响面、验证和回滚。

Human 拒绝或无法确认时，任务保持 `waiting_human`，不能以“低风险实现”绕过。

## 8. Hooks 的执行边界

PreToolUse Hook 可以快速调用：

```text
liushi-harness policy check-action --stdin
```

但 Hooks 不是唯一边界：

- 执行器可能存在未覆盖工具路径。
- 多个 Hook 可能并发。
- Post Hook 无法撤销副作用。
- 用户可能禁用不受企业管理的 Hook。

因此同一 Policy 还必须在 CLI Action、Connector、Git 写入和 CI 中重复执行。重复的是同一个确定性 Policy Engine，不是复制规则实现。

## 9. 降低 Human 审批成本

- 一次只展示一个阻断决策。
- 将相关低风险动作批量绑定到精确 Plan Digest。
- 批准范围内不重复询问。
- 仅在范围、事实、风险或 Artifact 变化时重新审批。
- DecisionRequest 必须给出证据、推荐项和每个选项的后果。
- 不把格式化、普通测试和只读扫描伪装成高风险操作。

目标是减少无价值打断，不是减少真正必要的 Human 判断。

## 10. Waiver 规则

Waiver 仅用于“已知检查无法完成但 Human 接受剩余风险”，不得用于：

- 跳过 Requirement Approval。
- 跳过历史业务逻辑确认。
- 绕过 Forbidden Policy。
- 伪造测试通过。
- 自动合并或自动发布。
- 永久关闭 Blocking Rule，或把 Architecture Violation 伪装成验证缺失。

Waiver 必须有原因、范围、有效期和补偿措施，并在 EvidenceBundle 和最终 Review 中显著展示。

## 11. Policy 变更

AI 可以生成 Policy Patch Proposal。确定性 CLI 负责：

- Schema 校验。
- 展示旧值、新值和影响范围。
- 运行 Policy Eval Fixtures。
- 请求 G7 Human Gate。
- 写入文件和变更记录。

Hard Invariant 只能通过 Harness 发布版本和 ADR 修改，不能由项目级 Skill 覆盖。

## 12. Rule、Policy 与例外

- Rule 描述代码、架构和业务机制必须满足的结果。
- Policy 判断某个动作是否允许，以及是否需要 Human Gate。
- Validator 为 Blocking Rule 提供可重复执行的机械证据。
- 单次偏离通过 G8 创建有范围、有期限的 Rule Exception，不能直接修改规则文件。
- 永久规则变更作为 LearningCandidate 通过 G7 晋升，并重新运行历史任务 Eval。

G8 Approval 绑定 Rule ID、RuleBundle Digest、目标文件、精确 Diff、失效条件和补偿验证。实现或上下文变化后必须重新审批。完整机制见 [Rules 与代码合规](./16-rules-and-code-compliance.md)。
