# ADR-015: 价值优先的生产黄金路径

- Status: Accepted
- Date: 2026-08-02

## Context

`liushi-harness` 已经具备规则解析、Human Gate、受管 Worktree、Codex Hook、验证证据和
CodingTask 交付尾链，但原始目标中的 PRD 接入、需求澄清、Skill、项目 Memory 和 Agent
配置仍缺少生产运行时。继续深化摘要协议、发布证明、恢复状态或重复公开项目 Pilot，会增加
Human 操作和维护成本，却不能证明真实项目的 Human Touch Time 已经下降。

SHA-256 适合标识不可变内容、并发比较和供应链证明，但不能证明业务语义、风险判断或 Human
已经理解方案。由同一 Harness 生成摘要、展示摘要并验证 Human 回填摘要，也不会建立新的信任
边界。

## Decision

- 第一生产路径固定为：`PRD -> Context -> Requirement Proposal -> Human Battle -> PlanRisk ->
CodingTask -> Verification -> PR-ready -> Learning Candidate`。
- 交付顺序优先补齐该路径的最薄纵向切片，不再按底层模块的理论完整度排序。
- Human 审阅问题、方案、风险和 Diff；内容摘要由 Harness 内部绑定，不作为日常 CLI 必填参数。
- 项目首次接入、不可变 Artifact、并发提交和发布物仍可在内部使用摘要。只有跨信任域的机器接口
  才公开摘要字段。
- 低风险只读分析不设置 Human Gate。存在未决业务语义时进入 Human Battle；涉及历史业务逻辑、
  跨仓写入、高风险操作或扩大 Write Set 时必须在编码前由 Human 确认；最终合并继续由 Human
  审批。
- 同一未变输入只执行一次端到端 Smoke。文档、小范围纯逻辑修改和局部 Adapter 修改使用影响面
  测试，不重复运行无新增信息的真实模型用例。
- 目录只承载真实业务模块；`index.ts` 只出现在需要稳定公共边界的位置，不为单个类型或常量机械
  创建目录和 Barrel。
- Sigstore、Release Host、兼容性证明和 Closeout Recovery 保持可用但冻结。没有真实发布需求、
  生产故障或新信任边界时不继续深化。
- Studio、完整多仓写入和 Durable Engine 继续延后，直到 CLI 黄金路径在真实项目产生可量化数据。

## First Slice

首个纠偏切片提供只读 `requirement analyze`：

1. 接收 PRD 文件、Repository Root、显式 Codex 可执行文件和模型。
2. 以 Codex 原生结构化输出和只读 Sandbox 生成 `RequirementContractProposal`。
3. 使用 Harness 现有 Artifact Schema 复验模型结果。
4. 输出 Human 可直接审阅的语义 Proposal，不创建 Approval，不要求 Human 输入摘要。
5. Proposal 中存在 `unknowns` 时明确进入 Human Battle；没有未决项也不自动批准后续 PlanRisk。

该命令只形成 Proposal，不修改 Repository、不创建 Task、不写入 Artifact Store，也不声称需求已经
批准。后续切片再把 Human 修订后的 Proposal 接入现有 `artifact propose` 与 Workflow。

## Validation

- Unit、CLI、Composition Root、CommandRunner 与 E2E 影响面测试共 28 项通过。
- 真实 Codex CLI `0.145.0` 使用显式 `gpt-5.6-sol` 在 74.6 秒内返回
  `human_battle_required` Requirement Proposal。
- 目标 Fixture Repository 在命令前后均为干净状态，证明该用例没有产生 Repository 写入。
- Codex 适配层使用专用 Strict Structured Outputs 投影；按
  [OpenAI Structured Outputs 约束](https://developers.openai.com/api/docs/guides/structured-outputs#all-fields-must-be-required)，
  所有对象字段均为 required，领域可选字段在线格式中用 `null` 表示，再由适配层还原，避免把领域
  Zod optional 直接传给模型接口。
- 本次验证只证明该固定只读场景可用，不证明企业项目提效比例、跨仓上下文完整度或 Human Battle
  闭环已经完成。

## Consequences

- 当前公开 Pilot 停止在模型启动前，不再为同一固定场景重复生成证据。
- 新增能力必须说明它减少了哪一段 Human 工作，并通过对应的用户路径验收。
- 内部 Event Hash、Artifact Digest 和 CAS 可以保留，但 Presentation 层不得把它们泄漏为常规
  Human 操作负担。
- 现有超细目录不在本切片内大规模重构；后续只在触及模块时合并明显的机械分片，避免无收益迁移。
- 25% 自动化和 Human Touch Time 降幅仍是待真实企业 Case 验证的目标，不是当前完成声明。
