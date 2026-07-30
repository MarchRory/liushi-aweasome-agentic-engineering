# Pilot Metrics 技术方案

## 1. 目标

Pilot Metrics 为真实项目 Pilot 提供可审计的原始事实采集能力，用于后续验证 Human Touch Time
与自动化效果。它是独立于 CodingTask Session 生命周期的度量平面，不修改
`activate -> closeout -> complete` 主线，也不参与风险决策或业务代码写入。

首版只证明以下事实：

- Pilot 是否在 Agent 启动前完成预登记。
- Human 是否显式提交了完整的实际操作时间区间。
- 预登记步骤是否有逐项执行事实。
- Session 的 Activation、受信进程、Closeout 与 Verification 证据是否一致。
- 哪些事实缺失、冲突或仍需 Human 判定。

首版不得输出“HTT 下降 25%”“自动化率提升”“企业 ROI”或其他因果结论。

## 2. 边界

### 2.1 纳入

- 单个 `(workspaceId, sessionId)` 作为不可拆分的分析单位。
- Session 启动前的不可变 Enrollment。
- Session 完成后的不可变 Settlement。
- Human Touch 原始区间、步骤执行事实和 Human 判定的质量事实。
- 既有 Activation、Agent Process、Closeout 与 EvidenceBundle 的只读证据绑定。
- Runtime Store 内的 create-only 持久化、幂等重放与冲突检测。

### 2.2 不纳入

- Workflow Studio、Memory、Skill、知识晋升和多仓归因。
- Dashboard、跨任务聚合、基线对照、A/B 分析和统计显著性。
- 从机器时长、墙钟等待、Trace 或 Agent 文本推断 Human Touch Time。
- 自动推断 Rework、Gate 误报、错误放行或业务成功。
- 保存 Prompt、命令输出、Ticket URL、绝对路径、客户名、邮箱、凭据或原始 Tool ID。

## 3. 数据字典

### 3.1 Enrollment

Enrollment 必须在 Agent 进程启动前创建，冻结以下字段：

| 字段                     | 含义                    | 约束                                             |
| ------------------------ | ----------------------- | ------------------------------------------------ |
| `pilotId`                | 脱敏 Pilot 标识         | 安全 ID，不得包含业务文本                        |
| `workspaceId`            | Harness Workspace       | 与后续权威证据精确匹配                           |
| `sessionId`              | CodingTask Session      | 一个 Session 仅允许一条 Enrollment               |
| `codingTaskId`           | CodingTask              | 与 Activation 精确匹配                           |
| `repositoryId`           | Repository              | 与 Activation 精确匹配                           |
| `taskClass`              | 任务类型                | 使用封闭枚举                                     |
| `riskLevel`              | 任务风险                | 使用封闭枚举                                     |
| `historicalLogicChange`  | 是否修改历史业务逻辑    | 仅记录分类，不替代 Human Gate                    |
| `plannedWritePathCount`  | 计划写路径数量          | 非负整数，不保存路径                             |
| `requiredValidatorCount` | Required Validator 数量 | 非负整数                                         |
| `repositoryRevision`     | 运行前 Revision         | 不得使用可变分支名                               |
| `harnessRevision`        | Harness Revision        | 绑定实际执行版本                                 |
| `policyDigest`           | 生效策略摘要            | RFC 8785 Content Digest                          |
| `plannedSteps`           | 预声明步骤              | 稳定 ID、阶段、Required、预期执行模式            |
| `enrolledAt`             | 预登记时间              | 规范 UTC                                         |
| `actor`                  | 登记 Actor              | Human 和已脱敏 opaque ID；审计声明不等同身份认证 |

同一个步骤的 Retry 或 Replay 不增加步骤分母。步骤不得在 Settlement 阶段新增或删除。

### 3.2 Settlement

Settlement 只能在既有 Session 已形成确定性 Closeout 与 Verification 证据后创建：

| 字段                   | 含义                       | 约束                                             |
| ---------------------- | -------------------------- | ------------------------------------------------ |
| `enrollmentDigest`     | Enrollment 内容摘要        | 必须精确匹配已持久化记录                         |
| `verificationRunId`    | Verification 运行标识      | 必须可从 Evidence Store 重建                     |
| `verificationActionId` | 生成验证证据的 Action 标识 | 必须绑定终态 Action Journal 的输出摘要           |
| `humanTouchEntries`    | Human 实际操作区间         | 唯一 ID、UTC 半开区间 `[start,end)`              |
| `stepFacts`            | 预登记步骤执行事实         | 每个步骤恰好一条，不允许额外步骤                 |
| `qualityFacts`         | Human 判定的质量事实       | 只保存枚举、关联 ID 和 Evidence Digest           |
| `attestation`          | Human 完整性声明           | 固定枚举，不允许自由文本                         |
| `settledAt`            | 结算时间                   | 不早于全部 Human 区间结束时间                    |
| `actor`                | 结算 Actor                 | Human 和已脱敏 opaque ID；审计声明不等同身份认证 |

Human Touch 只包含 Human 主动操作，例如需求澄清、方案确认、Prompt 修正、Review、返工、
恢复和验证解释。纯机器运行或无人等待不得计入。没有可信区间时保持 `not_measured`，不得补估。

### 3.3 证据来源

| 事实                        | 权威来源                                                |
| --------------------------- | ------------------------------------------------------- |
| Session 与任务身份          | CodingTask Session Activation Record                    |
| 机器执行时长与执行器信息    | Agent Session Process Evidence                          |
| 受控变更与 Checkpoint       | CodingTask Session Closeout State                       |
| Verification 结果           | EvidenceBundle                                          |
| Verification 执行与证据产出 | Action Journal 的终态 Observation                       |
| Human Touch                 | Settlement 中显式 `reported` 或受信宿主 `observed` 区间 |
| Rework、误报、错误放行      | Human 判定的 Quality Fact，不得从次数推断               |

Machine Duration 与 Human Touch Time 是两个独立事实。任何实现都不得将前者加入后者。
`stepFacts.evidenceDigests` 与 `qualityFacts.evidenceDigest` 是 Human 报告的外部证据引用，
用于关联 Ticket、测试或审阅事实；它们不属于 Harness 权威证据集合，也不能被 Report
升级为已验证事实。权威机器证据只来自上表的 Runtime Store。

## 4. 持久化与幂等

Pilot Metrics 使用 Runtime Store 的独立命名空间：

```text
<runtime-store>/
  workspaces/<workspaceId>/
    pilotMetrics/
      sessions/<sessionId>/
        enrollment.json
        settlement.json
```

- 两个文件均为 canonical JSON、create-only、不可修改。
- 同一规范内容重复写入返回 `reused`。
- 同一定位信息出现不同内容返回 `conflict`。
- 写入结果未知时返回 `outcome_unknown`，不得自动重试。
- 读取时必须重新解析领域对象并复算全部摘要。
- Store 位于受信 Runtime Store，不写入业务仓库。

## 5. 反作弊与隐私约束

以下任一情况必须拒绝 Settlement：

- Enrollment、Activation、Agent Process、Closeout、Verification Action/Evidence 与 Settlement
  不满足完整生命周期时间偏序。
- Workspace、Session、CodingTask、Repository、Worktree 或 Attempt 不一致。
- Enrollment Digest、Activation Digest、Process Evidence Digest 或 EvidenceBundle Digest 漂移。
- Human Touch 区间重叠、倒序、时长不一致或时间格式不规范。
- Settlement 包含 Enrollment 未声明的步骤，或缺少 Required 步骤事实。
- Verification 与 Closeout 的 Repository、Worktree、Base Revision 或 Target Revision 不一致。
- Verification Action 不是完成态，或其最新成功 Observation 的输出摘要不等于 EvidenceBundle 摘要。
- Verification Action Journal 的任一历史 Record 未按 sequence 保持时间非递减。
- Actor 不是 Human，或 Actor ID 含邮箱、路径等未脱敏格式。
- 出现未知枚举、自由文本质量结论或禁止持久化的敏感字段。

同一 Human 同时处理多个 Task 的跨 Session 重叠，首版不会自动消重。报告必须保留
`reported` 来源并禁止把它表述为受信宿主观测值。

## 6. Report 语义

只读 Report 可以输出：

- Enrollment、Settlement 与全部权威证据摘要。
- Machine Duration 原始值。
- Human Touch 原始区间和逐项时长。
- 预登记步骤及逐项执行事实。
- Quality Fact 原始条目。
- Verification 状态。
- 缺失证据、冲突与 Claim Eligibility。

Report 不计算自动化率、HTT 降幅、Retry Rate、Rework Rate、Gate 误报率、错误放行率或跨任务
Cycle Time。`descriptive_available` 只表示单 Session 描述性事实完整，不表示提效成立。
CLI 对 `not_measured` 或 `claimEligibility=blocked` 均输出 blocked Envelope 和退出码 `4`；
只有 `descriptive_only` 返回退出码 `0`。

## 7. Go / No-Go

### 7.1 Go

- 至少三个真实、脱敏、预登记的企业 Task 完成完整主线。
- 每个 Task 都绑定实际 Harness、Executor、Model、Policy 和 Repository Revision。
- Human Touch 来源明确；缺失时保持 `not_measured`。
- Requirement、PlanRisk、历史逻辑 Human Gate、Verification 和 Closeout 继续使用既有关闭式规则。
- 原始事实可重放、不可变、可脱敏审计，重复读取不重复计数。

### 7.2 No-Go

以下任一情况立即停止量化声明并降级为技术演练：

- 越权写入、缺少 Required Human Gate 或静默降级。
- Evidence 缺失、摘要漂移、不可恢复的 `outcome_unknown` 或时钟矛盾。
- 隐私事件、凭据泄漏或企业原始内容进入 Metrics Store。
- 为降低 HTT 而省略 Review、验证、返工或恢复时间。
- Baseline 与 Pilot 的任务类别、风险和验证强度不可比。

三个 Task 只是 Pilot 运行门槛，不代表统计显著性。跨任务量化必须在真实数据产生后另行设计。

## 8. 接入顺序

```text
Human 冻结任务分类与步骤
  -> metrics enroll
  -> session activate
  -> 受信宿主运行 Agent
  -> session closeout
  -> session complete
  -> Human 提交时间与质量事实
  -> metrics settle
  -> metrics report
```

Pilot Metrics 是可选能力。未启用时，现有 CodingTask Session 主线行为保持不变。

## 9. CLI 输入示例

输入文件不包含 `schemaVersion` 或 `recordDigest`，Application 会严格解析后注入版本并计算摘要。
以下标识均为脱敏示例。

### 9.1 Enrollment

```json
{
  "pilotId": "pilot-2026-q3",
  "workspaceId": "workspace-bi",
  "sessionId": "01J00000000000000000000000",
  "codingTaskId": "coding-task-42",
  "repositoryId": "repository-web",
  "taskClass": "feature",
  "riskLevel": "medium",
  "historicalLogicChange": false,
  "plannedWritePathCount": 4,
  "requiredValidatorCount": 3,
  "repositoryRevision": "0123456789abcdef0123456789abcdef01234567",
  "harnessRevision": "89abcdef0123456789abcdef0123456789abcdef",
  "policyDigest": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "plannedSteps": [
    {
      "stepId": "plan",
      "phase": "plan",
      "required": true,
      "expectedExecutionMode": "human"
    },
    {
      "stepId": "implement",
      "phase": "implement",
      "required": true,
      "expectedExecutionMode": "automated"
    },
    {
      "stepId": "verify",
      "phase": "verify",
      "required": true,
      "expectedExecutionMode": "automated"
    },
    {
      "stepId": "review",
      "phase": "review",
      "required": true,
      "expectedExecutionMode": "human"
    }
  ],
  "enrolledAt": "2026-07-30T09:00:00.000Z",
  "actor": {
    "kind": "human",
    "actorId": "human-22877"
  }
}
```

执行成功后保存 JSON 输出中的 `data.record.recordDigest`，Settlement 必须精确引用该摘要。

### 9.2 Settlement

```json
{
  "pilotId": "pilot-2026-q3",
  "workspaceId": "workspace-bi",
  "sessionId": "01J00000000000000000000000",
  "codingTaskId": "coding-task-42",
  "repositoryId": "repository-web",
  "enrollmentDigest": "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  "verificationRunId": "verification-run-42",
  "verificationActionId": "01ARZ3NDEKTSV4RRFFQ69G5FEX",
  "humanTouchEntries": [
    {
      "entryId": "review-1",
      "category": "review",
      "source": "reported",
      "startedAt": "2026-07-30T10:30:00.000Z",
      "completedAt": "2026-07-30T10:35:00.000Z",
      "durationMs": 300000
    }
  ],
  "stepFacts": [
    {
      "stepId": "plan",
      "actualExecutionMode": "human",
      "outcome": "completed",
      "attemptCount": 1,
      "evidenceDigests": []
    },
    {
      "stepId": "implement",
      "actualExecutionMode": "automated",
      "outcome": "completed",
      "attemptCount": 1,
      "evidenceDigests": []
    },
    {
      "stepId": "verify",
      "actualExecutionMode": "automated",
      "outcome": "completed",
      "attemptCount": 1,
      "evidenceDigests": []
    },
    {
      "stepId": "review",
      "actualExecutionMode": "human",
      "outcome": "completed",
      "attemptCount": 1,
      "evidenceDigests": []
    }
  ],
  "qualityFacts": [],
  "attestation": "complete",
  "settledAt": "2026-07-30T10:36:00.000Z",
  "actor": {
    "kind": "human",
    "actorId": "human-22877"
  }
}
```

若 Human Touch 未完整记录，应使用 `incomplete` 或 `not_measured`，不得补估；`not_measured`
不能同时携带区间。`observed` 仅保留给受信宿主，当前生产 CLI 会关闭式拒绝。
