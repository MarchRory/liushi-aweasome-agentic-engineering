# 00 愿景与范围

## 1. 问题定义

软件团队已经能够让 Coding Agent 生成代码，但真实生产交付仍然存在以下断点：

- 需求没有形成可验证契约，Agent 在模糊前提下直接实现。
- 历史业务逻辑散落在代码、提交记录、Wiki 和人员记忆中。
- Agent 的计划、执行、验证和总结没有稳定状态，长任务或多任务容易丢失上下文。
- Prompt、Skill 和知识会增长，但缺少证据、评估、审批和淘汰机制。
- 不同执行器的 Hooks、Agent、权限与配置不一致，项目被绑定到单一厂商。
- 自动化率容易只统计编码时间，忽略 Human 审查、返工、缺陷和恢复成本。

`liushi-harness` 的定位不是另一个 Coding Agent，而是位于 Human、执行器和项目之间的治理与运行层。

## 2. 产品目标

`liushi-harness` 必须帮助团队稳定完成以下闭环：

```text
发现上下文 -> 澄清需求 -> 确认契约 -> 方案与风险 ->
解析项目 Rules -> 受控开发 -> 独立验证 -> 证据交付 -> 候选学习 -> Human 晋升
```

首月生产目标：

1. 支持一个现有 TypeScript 前端项目完成真实接入。
2. 支持多仓 Workspace Graph 和公共层只读上下文，默认只允许单仓写入。
3. Codex 路径达到生产可用，Claude-compatible/CatPaw 完成真实兼容链路验证。
4. 至少完成 3 个真实需求。
5. 预登记任务的 Human Touch Time 中位数下降至少 25%。
6. 总交付周期、返工、缺陷和 Review 轮数不能明显恶化。

## 3. 核心不变量

以下约束高于单个执行器、Agent Prompt 和模型能力：

1. **AI 只提出结构化 Proposal。** 规范状态只能由确定性 CLI 校验并写入。
2. **高风险操作必须由 Human 确认。** Agent、Hook 和 Skill 都没有审批权。
3. **历史业务逻辑改动先确认现状和改动契约。** 未确认不得获得实现权限。
4. **所有完成声明必须有 Evidence Bundle。** 缺失必需验证时必须失败或记录 Human Waiver。
5. **长期知识与 Skill 只能从候选晋升。** 自动生成不等于自动生效。
6. **状态可恢复、行为可审计。** 关键动作必须有事件、执行记录和 Artifact Digest。
7. **平台适配器不能拥有核心状态。** 更换执行器不能改变任务事实或 Gate 结果。
8. **不静默降级。** 模型、权限、验证或连接器能力下降必须可见并可审计。
9. **Blocking Rule 必须可执行。** 不能只把代码和架构规则写进 Prompt，再依赖 Agent 自我声明合规。
10. **平台指导文件只是投影。** `AGENTS.md`、`CLAUDE.md` 和平台 Agent 配置不能成为 Core 真源。
11. **平台 Memory 不是 Evidence。** 长期事实必须进入 Harness Candidate/Knowledge 治理并重新验证来源。
12. **Agent 必须有 Contract。** 模型、权限、工具、Context、Memory、输入输出和 Eval 缺一不可。

## 4. 目标用户

- 在倒排期中使用 Coding Agent 交付真实需求的开发者。
- 需要统一 AI 开发流程、风险和证据标准的项目负责人。
- 维护公共层、多仓依赖和企业知识连接器的平台团队。
- 希望将项目实践沉淀为可复用 Skill 和知识的开源维护者。

## 5. 首月范围

### 5.1 包含

- TypeScript CLI 和文件型本地运行时。
- 结构化 Artifact Schema、状态机、Policy 和 Human Gate。
- Project Rule Catalog、Architecture Mechanism、ApplicableRuleBundle 和 Compliance Report。
- Instruction Catalog、AGENTS/CLAUDE Projection 和 Managed File Drift。
- Working Memory、MemoryCandidate、Retrieval Index 和 `memory-curator` Skill。
- Agent Registry、AgentDefinition 和 Codex/Claude-compatible 配置生成。
- Codex 插件、Skill、Hooks 和执行器适配。
- Claude-compatible 配置生成与 CatPaw 能力探测。
- Git Worktree 隔离。
- 单仓写入、多仓读取与依赖图。
- Wiki/MCP 只读连接和写入草稿。
- 验证编排、Evidence Bundle 和 Human Waiver。
- Learning Candidate 生成、评估和人工晋升。
- 安装、升级、Doctor、Repair、Recover 和 Uninstall。

### 5.2 明确不包含

- 自动合并、自动发布或自动批准。
- 无 Human 审批的跨仓写入。
- 跨仓原子事务。
- 自动晋升正式 Skill 或直接覆盖 Wiki 正式内容。
- 云端控制面、常驻守护进程和 Web Dashboard。
- 通用 Agent 集群或无限递归委派。
- 自建基础模型调用网关或在核心中嵌入模型 SDK。
- 完整 Obsidian 插件。首月只支持可选文件投影。

## 6. 开源与企业边界

开源 npm 包可以包含：

- CLI、Schema、状态机、模板、通用 Policy。
- Codex 和 Claude-compatible 适配器。
- 不含业务信息的 Skills、Hooks 和 Connector 接口。
- 示例项目、测试夹具和评估框架。

企业项目本地保存：

- 代码扫描结果和项目 Profile。
- 任务、审批、Evidence 和运行日志。
- Wiki 凭据、内部 URL 和业务知识。
- 企业自定义 Connector、Policy、Instruction、Memory Policy、Skill 和 AgentDefinition。

任何发布、遥测和错误报告都不得默认上传项目内容。首月默认不提供远程遥测。

## 7. 成功与失败定义

### 7.1 成功

- Human 介入集中在需求契约、高风险决策、例外和最终合并。
- Agent 可以在批准范围内连续工作，不需要反复提醒项目规范。
- 一个中断任务可以从持久化状态继续，而不是依赖聊天记录重建。
- 新成员能通过 Onboarding Skill 和 CLI 快速接入同类项目。
- 每条新增知识和 Skill 规则都能追溯到任务、证据和 Human 决策。

### 7.2 失败

出现以下任一情况都不能以“自动化率提高”判定项目成功：

- Human 审查或返工时间转移到流程末端。
- 为降低 HTT 而减少必要验证或隐藏失败。
- Agent 绕过历史逻辑确认或扩大写入范围。
- 知识库被未经验证的总结污染。
- 执行器不可用时静默切换模型、权限或验证标准。

## 8. 发布原则

新项目采用四级放量：

1. `report-only`：只分析和报告。
2. `assisted`：生成契约、方案和风险，Human 执行变更。
3. `controlled`：在低风险单仓范围内自动开发和验证。
4. `production`：在 Policy 允许范围内执行完整流程，仍保留所有 Human Gate。

任何异常都可以退回 `report-only`，且不应要求卸载 Harness 才能停止自动化。
