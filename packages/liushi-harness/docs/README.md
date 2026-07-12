# liushi-harness 技术方案

Status: Implementation-aware Architecture Baseline

## Architecture Baseline

下列文档构成进入实现阶段前必须通过评审的 Architecture Baseline：

| 文档                                                       | 评审重点                                       |
| ---------------------------------------------------------- | ---------------------------------------------- |
| [00 愿景与范围](./00-vision-and-scope.md)                  | 目标、非目标、初始版本范围、成功标准           |
| [01 系统架构](./01-system-architecture.md)                 | 模块边界、依赖方向、执行器适配、信任边界       |
| [02 Artifact 契约](./02-artifact-contracts.md)             | AI 与确定性核心之间的数据协议                  |
| [03 任务状态机](./03-task-state-machine.md)                | 生命周期、Human 等待、失败与恢复语义           |
| [04 Policy 与 Human Gates](./04-policy-and-human-gates.md) | 风险分类、审批条件、不可绕过规则               |
| [05 存储、锁与恢复](./05-storage-lock-and-recovery.md)     | 本地状态、并发、幂等、崩溃恢复                 |
| [06 代码库组织与工程约束](./06-codebase-organization.md)   | 分层、模块模板、常量、注释、设计模式、架构测试 |

## Runtime Design

| 文档                                                               | 评审重点                                            |
| ------------------------------------------------------------------ | --------------------------------------------------- |
| [07 Workspace 与多仓组织](./07-workspace-and-multi-repo.md)        | 多仓 Graph、公共层、Read/Write Set、Worktree、Saga  |
| [08 执行器适配](./08-executor-adapters.md)                         | Codex、Claude-compatible、CatPaw 能力矩阵与支持声明 |
| [09 Hooks 与 Agent Runtime](./09-hooks-and-agent-runtime.md)       | Canonical Hook、角色权限、失败和降级语义            |
| [10 模型路由与评估](./10-model-routing-and-evaluation.md)          | 顶层 SOTA、角色路由、升级、Fallback 与 Eval         |
| [11 Skills 与 Connectors](./11-skills-and-connectors.md)           | Skill 治理、确定性脚本、MCP、Wiki、Obsidian         |
| [12 验证与 Evidence](./12-verification-and-evidence.md)            | Validator、独立验证、EvidenceBundle、Waiver         |
| [13 学习与知识治理](./13-learning-and-knowledge.md)                | Candidate、知识作用域、失效、晋升与污染控制         |
| [16 Rules 与代码合规](./16-rules-and-code-compliance.md)           | Rule Catalog、架构机制、代码指导、执行与例外        |
| [17 Instruction Projection](./17-instruction-projection.md)        | AGENTS/CLAUDE 指导源、编译、投影、漂移与所有权      |
| [18 Memory Runtime](./18-memory-runtime-and-curation.md)           | 记忆分层、写入标准、检索、恢复与 Memory Curator     |
| [19 Agent Registry](./19-agent-registry-and-platform-rendering.md) | Agent Contract、权限、模型、Skill 与平台渲染        |

## Operations

| 文档                                                                            | 评审重点                                              |
| ------------------------------------------------------------------------------- | ----------------------------------------------------- |
| [14 生产接入与长期使用 SOP](./14-production-adoption-sop.md)                    | Onboarding、Task 交付、治理、异常与卸载               |
| [15 能力门驱动的交付路线](./15-delivery-roadmap.md)                             | 当前能力、决策门、完成门与真实项目验证                |
| [20 文档与实现状态矩阵](./20-implementation-status-matrix.md)                   | 06-19 状态、产品边界、依赖与文档完成门                |
| [21 需求生命周期 Workflow 产品与技术方案](./21-requirement-workflow-runtime.md) | Workflow、Command、CodingTask、Studio 与多仓 PR-ready |

## 评审规则

每份技术方案必须回答：

- 目标与非目标是什么。
- 哪些能力直接复用业界标准或工具。
- 哪些不变量由 `liushi-harness` 自己保证。
- 输入、输出、状态和失败语义是什么。
- 权限边界和 Human Gate 在哪里。
- 如何测试、观测、升级和回滚。
- 哪些问题明确推迟到后续版本。

关键决策记录在 [`decisions/`](./decisions/) 中。技术方案变更如果推翻已接受的 ADR，必须新增 ADR 说明原因，不能静默改写历史决策。

工程规范：

- [Commit、版本与 Changelog](./engineering/commit-and-release.md)
