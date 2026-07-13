# Verification 影响面选择

## 目标

本切片把 G8 已确认的 Project Verification Check、CodingTask 当前实现结果和 Applicable Rule Bundle 确定性编译为 `VerificationPlan`。选择结果必须可重放、可解释，并且不能由 Agent 临时发明命令或降低验证要求。

## 权威输入

1. `ProjectProfileProposal` 保存完整 Verification Check 定义，包括命令、必要级别、选择模式、路径 Glob 和 Validator ID。
2. G8 对 Proposal Artifact 的精确 Digest 做不可豁免审批；编译器只把已批准定义复制进 `ProjectProfile` 和 Profile Digest。
3. `CodingTaskAggregate` 提供 Repository、Worktree、Branch 和 Base Revision；当前 Attempt 提供 `targetRevision` 与 `changedPaths`。调用方不得重复提交这些字段形成第二真源。
4. `ApplicableRuleBundle` 必须为 `ready`，并绑定相同 Task、Workspace Graph、Repository Revision 和 Project Profile Revision。

## 选择规则

- `required` Check 始终进入 Plan，不允许路径条件缩小 Required Set。
- `conditional` 与 `advisory` Check 只在已批准的 Path Glob 命中 Changed Path，或 Applicable Rule 通过 Validator ID 显式要求时进入 Plan。
- Blocking Rule 声明的 Validator 没有任何已批准 Check 映射时，选择结果固定为 `blocked`。
- Changed Path 没有完整 Rule Target 覆盖、Profile/Rule Revision 漂移或身份不一致时 fail closed。
- 缺少 Import Graph、Workspace Dependency 或 Test Mapping 证据时不推测无关；使用已批准的保守全量 Check，而不是静默排除。
- 所有集合按规范值排序去重，不依赖 Event 中 Changed Paths 的原始顺序。

## 审计输出

成功结果包含：

- 绑定 Repository、Worktree、Branch、Base Revision 和 Target Revision 的 `VerificationPlan`。
- 每个候选 Check 的 selected/excluded 结论、稳定原因码、命中路径、贡献 Rule ID 和 Validator ID。
- 已持久化的 Project Profile Bundle、当前 Repository Profile、G8 Proposal/Approval 和 Applicable Rule Bundle 来源引用。

当前结果直接返回完整 Selection Trace，不生成只有摘要而没有持久化载体的独立 Selection Digest。后续若持久化 Trace，必须同时定义写入、读取与恢复协议。

`VerificationCommandHandler` 在执行前必须再次比较 Plan Target Revision 与当前 Attempt Target Revision。即使调用方绕过 Selector 构造 Plan，也不能验证错误或陈旧 Revision。

## Human Gate

- 新增、修改或降低命令、Requirement、Selection Mode、Path Glob 或 Validator 映射，必须生成新的 ProjectProfileProposal Revision 并重新通过 G8。
- Human 可以要求扩大验证范围；缩小 Required Set、排除无法证明无关的 Check 或接纳缺失 Blocking Validator 不属于本切片。
- G5 Waiver、Rule Exception、Flaky 分类和重试不能用于绕过选择失败。

## 非目标

本切片不实现 Import Graph、CODEOWNERS、历史失败学习、Flaky Retry、Waiver、Independent Verifier、多仓影响传播、Studio、自动修复或新的命令执行器。Selector 是纯确定性逻辑；Runner、Action Journal 和 Evidence Store 继续复用现有实现。

## 完成门

1. Profile Proposal、Profile Compiler 和 Digest 覆盖完整 Verification Check 定义。
2. Selector 对身份、Revision、Rule Target 与 Validator 映射 fail closed。
3. 同一语义输入的顺序变化生成相同 Trace 和 Plan。
4. 外部构造的错误 Target Revision 在 Executor 与 Action Journal 副作用前被拒绝。
5. 单元、集成、架构、TS7/TS6、ESLint、Prettier、Markdown 和构建门全部通过。
