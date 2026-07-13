# 12 验证与 Evidence

## 1. 目标

Harness 不能以 Agent 声称“完成”作为交付依据。Verification 层必须将 Requirement、Risk、Diff、Project Validator 和独立 Review 组合成可复查 EvidenceBundle。

核心要求：

- 验证计划来自 ProjectProfile 和 PlanRisk。
- 命令由确定性 Runner 执行并记录实际 Revision。
- Validator 不修改代码使自己通过。
- 必需检查失败或缺失时不能进入 Review-ready，除非 Human Waiver。
- Evidence 保存原始来源引用，不只保存 Agent 摘要。
- 高风险任务使用 Frontier Independent Verifier。

### 1.1 当前实现状态

**状态：验证协议、证据装配、显式本地执行、版本化命令和单仓确定性影响面已实现，完整生产恢复编排尚未实现。** 当前已实现 `VerificationPlan`、`RunVerificationUseCase`、Local Command Adapter、`FileEvidenceBundleStore`、版本化 `VerificationCommandService` 和 `SelectVerificationPlanUseCase`。Local Command 模式校验 Git Root、Base/Target/HEAD，以 `shell=false` 执行并限制工作目录、环境、超时和输出。Bundle Store 重新校验结构、摘要、Revision、时间和聚合状态，支持幂等写入和篡改阻断。尚未实现 Import Graph、高级 Test Mapping、重试/Flaky、G5 Waiver、独立 Verifier 和多仓影响传播。

## 2. Verification Kind

```ts
/** Harness 可以编排并记录的标准验证类别。 */
export enum VerificationKind {
  /** 校验 Artifact、配置或数据是否符合 Schema。 */
  Schema = "schema",
  /** 执行 TypeScript 或其他静态类型检查。 */
  Typecheck = "typecheck",
  /** 执行代码、文档或配置 Lint。 */
  Lint = "lint",
  /** 校验唯一格式化结果且不自动修改。 */
  Format = "format",
  /** 执行隔离且快速的单元测试。 */
  UnitTest = "unit_test",
  /** 执行跨模块或外部 Adapter 集成测试。 */
  IntegrationTest = "integration_test",
  /** 执行用户可观察工作流的端到端测试。 */
  EndToEndTest = "end_to_end_test",
  /** 构建发布产物或应用 Bundle。 */
  Build = "build",
  /** 执行静态安全、Secret 或依赖检查。 */
  Security = "security",
  /** 校验实现是否满足当前 ApplicableRuleBundle 和架构机制。 */
  RuleCompliance = "rule_compliance",
  /** 执行仓库定义并经 Human 确认的自定义检查。 */
  Custom = "custom",
}

/** 一个 Verification Check 对交付 Gate 的必要程度。 */
export enum VerificationRequirement {
  /** 不通过就不能进入 Review-ready。 */
  Required = "required",
  /** 风险或变更命中条件时变为 Required。 */
  Conditional = "conditional",
  /** 提供额外信号，不单独阻断交付。 */
  Advisory = "advisory",
}

/** 一次 Verification Execution 的最终状态。 */
export enum VerificationStatus {
  /** 检查成功且结果适用于当前 Revision。 */
  Passed = "passed",
  /** 检查完成但未满足通过条件。 */
  Failed = "failed",
  /** 环境或能力原因导致检查未执行。 */
  Blocked = "blocked",
  /** Human 明确接受该检查缺失产生的风险。 */
  Waived = "waived",
}
```

## 3. Verification Plan

PlanRisk 为每个 Check 声明：

- Check ID、Kind、Requirement 和触发条件。
- Repository、Working Directory 和 Base/Target Revision。
- 精确命令、参数和允许环境变量。
- Timeout、Retry、输出上限和资源约束。
- 所需 Capability、服务和 Fixture。
- 适用 Rule ID、RuleBundle Digest 和 Architecture Mechanism ID。
- 通过条件和 Evidence 提取器。
- 失败时是否允许 Waiver。

命令来自已确认 ProjectProfile 或仓库脚本。Agent 建议的新命令必须先进入 Plan Proposal，不能直接执行未知脚本。

### 3.1 当前已实现的协议切片

- `VerificationPlan` 绑定 Repository、Worktree、Base Revision、Target Revision 和按 `checkId` 排序的 Check 集合。
- `ProjectProfileProposal` v2 在不可豁免 G8 下确认完整 Check 命令、Requirement、Selection Mode、Path Glob 和 Validator 映射；Compiler 将其写入 Profile 与 Digest，不从 script 名猜测命令。
- `SelectVerificationPlanUseCase` 重算 Profile、Catalog 和 Rule Bundle 摘要，从 CodingTask 最新 `ImplementationSubmitted` 读取 `targetRevision` 与 `changedPaths`，调用方不能自报第二份 Revision、Path 或 Target ID。
- Required Check 永远选择；Rule Target 覆盖不完整或 Blocking Validator 缺少 Check 映射时返回带完整 Trace 的 `blocked`，不生成 Plan。
- `VerificationCommandSpec` 只描述可执行文件、参数、相对工作目录和允许的环境变量名；校验器拒绝路径穿越、绝对工作目录、控制字符和不安全环境变量名，真实执行器仍必须使用非 Shell 参数数组。
- `RunVerificationUseCase` 串行调用 `VerificationExecutorPort`，把执行异常和非法结果转换为 `Blocked`，并按 Required/Conditional/Advisory 聚合整体状态。
- `EvidenceBundle` 保存 Plan Digest、Check 状态、失败分类、时间、退出码、输出 Digest 和可定位的 `EvidenceRef`，不保存原始 stdout/stderr。
- `FileEvidenceBundleStore` 按 Workspace/CodingTask/VerificationRun 不可变保存 Bundle；同 Run 不同摘要固定冲突，读取时重算摘要，原子提交结果未知时禁止自动重试。
- 默认 `MockVerificationExecutorAdapter` 不执行命令；只有显式注入的结果才会产生 Passed/Failed，未配置结果固定为 `Blocked`。
- `VerificationExecutionMode.LocalCommand` 必须由嵌入方显式选择；真实执行前会验证 Worktree Root、HEAD、Target Commit、Base Commit 和祖先关系，Revision 不一致固定为 `Blocked`。
- 真实命令使用非 Shell 参数数组，只传递 Plan 白名单中的环境变量，stdout/stderr 合计超过 1 MiB 或超时时终止；子进程关闭后才返回结果。

该切片只提供可替换的 Application/Infrastructure 边界，不代表已经具备真实项目执行能力。真实执行器必须在独立切片中补齐命令白名单、Worktree Root 校验、环境隔离、超时/取消、输出上限和 Action Journal。

## 4. 分层验证

执行顺序从快速、确定到昂贵、语义化：

1. Artifact、Config 和 Rule Schema。
2. Format Check。
3. Lint 和 Architecture Test。
4. Rule Compliance 和业务不变量 Validator。
5. Typecheck。
6. 受影响 Unit Test。
7. Integration Test。
8. Build。
9. E2E、Security 和自定义业务验证。
10. Independent Verifier。

前置检查失败时可以停止明显无意义的后续步骤，但 EvidenceBundle 必须记录 Skipped 原因，不能表现为全部通过。

## 5. 影响面选择

低风险 Task 可以先运行受影响检查，但 Review-ready 前必须满足 ProjectProfile 定义的 Required Set。当前实现使用 G8 Profile Path Glob、Applicable Rule Validator 映射和 Rule Resolution Target 生成单仓计划；无法证明 Target 覆盖完整时关闭式阻断。

Test Selection 使用：

- Changed File 和 Import Graph。
- WorkspaceGraph Dependency Edge。
- Package Script 和 Test Mapping。
- 历史失败和 CODEOWNERS。
- Public Contract 与 Shared Infra 标记。

AI 可以建议影响面，确定性 Selector 生成最终列表。当前尚未实现 Import Graph、Workspace Dependency、历史失败和 CODEOWNERS 传播，因此不能据此缩小范围；无法证明某 Test 无关时不自动排除。

## 6. Command Runner

Runner 必须记录：

- Command、Args、CWD 和允许环境变量名。
- Repository ID、Commit、Worktree 和 Dirty State。
- Tool Version、Started/Completed At、Exit Code 和 Signal。
- Stdout/Stderr 的脱敏摘要、完整输出位置和 Digest。
- Timeout、Retry 和资源终止原因。

Runner 使用参数数组而不是拼接 Shell String。需要 Shell 语法时明确选择 Shell Adapter，并在 Windows 与 Unix 分别测试。

## 7. 自动修复边界

- Verification Command 默认 Check-only，例如 `prettier --check` 和 `eslint`。
- Formatter 或 Linter Auto-fix 属于 Implementation Action，必须写入 Action Journal。
- Validator 不能在失败后修改源代码并重新报告“第一次通过”。
- 自动修复前后分别记录 Diff 和 Verification Execution。
- Generated File 更新使用专用 Use Case，不隐藏在 Test Script 中。

## 8. Flaky Test

初始版本默认最多重试一次，并满足：

- ProjectProfile 明确标记该 Check 可重试。
- 保存首次失败和重试结果。
- 通过重试不能删除 Flaky 标记。
- 同一 Check 在三个 Task 中出现至少两次 Flake 时生成 Learning/Validator Candidate。
- Critical Test 不因“历史上偶尔 Flaky”自动 Waive。

## 9. Independent Verifier

Verifier 输入：

- Approved Requirement、PlanRisk 和 Business Contract。
- WorkspaceGraph、ProjectProfile 和最终 Diff。
- Deterministic Verification Results。
- Known Waiver 和 Remaining Risk。

Verifier 输出 Finding：

- Severity、Category、File/Artifact Locator。
- Claim、Evidence、Impact 和 Recommended Action。
- 是否阻断 Review-ready。

Verifier 不能修改实现。Finding 需要修复时回到 Implementation，产生新 Diff 后重新运行受影响验证。

## 10. EvidenceBundle

Bundle 组织：

```text
evidence-bundle/
├── manifest.json
├── artifacts.json
├── approvals.json
├── diff.json
├── verifications.json
├── findings.json
├── risks.json
└── outputs/
```

Manifest 保存每个文件 Digest、Schema Version 和生成 Revision。大型输出可以外置，但必须有稳定 Locator、Retention 和 Content Digest。

## 11. 完整性 Gate

Review-ready 必须满足：

- Requirement Approval 有效。
- 所有触发的 Business/Cross-repo Gate 有效。
- Diff 位于 Write Set 且没有未知文件。
- Required Check 全部 Passed 或存在有效 Waiver。
- Conditional Check 的触发条件已确定性计算。
- EvidenceBundle 绑定当前 ApplicableRuleBundle Digest。
- InstructionBundle、AgentInstance 和 Memory Selection 与 Target Revision 一致。
- Platform Memory Claim 未被作为 Verification Evidence。
- 所有 Blocking Rule 均为 Compliant 或存在有效 G8 Rule Exception。
- RuleComplianceReport 覆盖全部受影响 Rule ID、文件和 Validator Evidence。
- Independent Verifier 没有未解决 Blocking Finding。
- EvidenceBundle Schema、Digest 和 Revision 一致。

Agent 无法通过修改 `required` 为 `advisory` 解除失败；ProjectProfile/Policy 变化需要 Human Review。

## 12. Waiver

Waiver DecisionRequest 必须展示：

- 未通过或未执行的精确 Check。
- 原始失败 Evidence 和已尝试措施。
- 影响范围、剩余风险和补偿验证。
- 有效 Scope、截止时间和 Owner。

Waiver 绑定 Check Input Digest 和 Target Revision。代码、配置或环境变化后自动失效。Waived 在 UI 和 Changelog/PR Summary 中不能显示为 Passed。

## 13. 多仓验证

- 每个写仓库有独立 Verification Set 和 Evidence。
- Shared Infra 修改必须运行已知下游 Compatibility Check。
- 跨仓集成检查记录所有 Repository Revision。
- Partial Saga 不能生成完整 Review-ready Bundle。
- 只读 Repository 的失败只在与本 Task 影响面相关时阻断，并保留判断 Evidence。

## 14. Frontend Golden Path

现有 TypeScript 前端项目默认候选：

- Prettier Check。
- ESLint。
- Architecture Test 和 ApplicableRuleBundle Compliance。
- TypeScript Typecheck。
- Vitest/Jest Unit Test。
- Production Build。
- Playwright 关键流程和截图，需求涉及 UI 时启用。
- Bundle、Accessibility 或企业自定义检查，根据 ProjectProfile 启用。

Harness 不替换项目原有测试框架，只负责发现、确认、编排和证据化。

## 15. Security Verification

按项目能力复用 Semgrep、CodeQL、Dependency Audit、Secret Scanner 和企业 CI。初始版本不自研安全分析引擎。工具未安装或企业网络受限时返回 Blocked，不伪装为“未发现问题”。

## 16. Metrics

- First-pass Verification Rate。
- Required Check Pass Rate。
- Flaky Retry Rate。
- Blocking Finding 数量和修复轮数。
- Waiver 数量、原因和过期情况。
- Rule Violation、Undetermined、Exception 和 Drift 数量。
- Verification 增加的 Wall Time 与节省的 Human Review Time。
- Production Defect 与漏检关联。

## 17. 测试要求

- Runner 参数、Timeout、Signal 和输出截断。
- Revision/Dirty State 绑定。
- Required/Conditional/Advisory 计算。
- Auto-fix 与 Check-only 分离。
- Flaky Retry 记录不丢失首次失败。
- Waiver Digest 和失效。
- Verifier 只读权限和 Finding Schema。
- EvidenceBundle 缺失、篡改和大输出。
- 多仓 Revision 与 Partial Saga。
- Rule Scope/优先级解析、Bundle Digest、Validator 覆盖和 G8 Exception 失效。
- Instruction/Agent/Memory Digest 漂移和 Platform Memory 伪造 Evidence。
