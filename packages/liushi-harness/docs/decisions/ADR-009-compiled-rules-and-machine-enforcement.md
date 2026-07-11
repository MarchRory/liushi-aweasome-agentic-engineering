# ADR-009: 编译式项目规则与机械执行

- Status: Accepted
- Date: 2026-07-11

## Context

项目中的代码风格、架构边界和业务机制通常分散在 Lint 配置、测试、目录结构、Wiki、历史代码和 Reviewer 经验中。仅把这些内容拼进 Prompt 无法保证 Agent 遵守，也无法证明某次实现使用了哪一版规则；直接把扫描到的主流写法自动提升为规则，又会把 Legacy Pattern 或偶然重复固化成错误约束。

Rules、Policy、Skill、Knowledge 和 Validator 还必须保持职责分离，否则项目会出现不可审计的 Prompt Policy 和无法复现的模型判断。

## Decision

- Human 确认的 `ProjectRuleCatalog` 和 `ArchitectureMechanismProfile` 是项目规则的 Canonical Source；自动扫描只生成 Candidate。
- Core Rule Resolver 根据 Harness、Organization、Workspace、Repository、Path 和 Task Scope 确定性解析优先级，生成不可变的 `ApplicableRuleBundle` 和 Content Digest。
- Plan、ContextBundle、RoleInvocation、Hook、Verification 和 EvidenceBundle 必须绑定同一个 RuleBundle Digest；Revision 或目标范围变化会使旧 Bundle 和相关 Approval 失效。
- AGENTS 指令、Skill 和平台 Hook 只投影或触发 Core 已解析的规则，不能自行增加、删除、合并或覆盖 Rule。
- `Blocking` Rule 必须绑定可重复执行的 Validator。无法机械判定的语义规则返回 `Undetermined`，不得伪装为 `Compliant`。
- 单次规则例外或架构机制偏离必须通过 G8，绑定 Rule ID、精确 Diff、Scope、期限、补偿验证和 Digest；永久规则变化必须作为 Candidate 经过 Eval 和 G7 Promotion。
- Rule Compliance 由 CLI、Hook、Git Hook 和 CI 复用同一 Core 实现。模型自检和 Independent Verifier 提供语义 Finding，但不替代确定性检查。
- Rule 与业务逻辑发生冲突时 Fail Closed，并要求 Human 先确认当前业务行为和精确改动方案。

完整契约和生命周期见 [Rules 与代码合规](../16-rules-and-code-compliance.md)。

## Consequences

- 每次实现可以证明适用了哪些规则、由哪些证据验证，以及哪些例外由谁批准。
- 新项目需要一次 Human 基线评审，首月接入成本高于只生成 Prompt 文件。
- 规则必须维护 Scope、Owner、Validator 和失效条件，不能无限积累静态 Best Practice 文本。
- 缺少 Validator 的重要语义约束会增加 G8 决策，但不会以隐藏不确定性换取自动化率。
- Codex、Claude-compatible 和 Generic Adapter 可以共享同一规则语义，只需分别实现投影和生命周期映射。
