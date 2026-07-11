# liushi-harness

`liushi-harness` 是一个 CLI-first、Human-gated、可审计的 Agent Engineering Harness。它把需求澄清、技术方案、风险识别、开发、验证、知识沉淀和 Skill 改进组织成可恢复的项目工作流，同时适配 Codex 和 Claude-compatible 执行器。

本目录是 Awesome 仓库中的独立子包，计划以 npm 包发布。开放源代码只包含通用框架、Schema、模板和适配器，不包含企业代码、Wiki 内容、凭据或业务知识。

## Status

当前处于技术方案阶段。实现代码将在 Architecture Baseline 通过评审后开始。

## Documents

- [技术方案索引](./docs/README.md)
- [00 愿景与范围](./docs/00-vision-and-scope.md)
- [01 系统架构](./docs/01-system-architecture.md)
- [02 Artifact 契约](./docs/02-artifact-contracts.md)
- [03 任务状态机](./docs/03-task-state-machine.md)
- [04 Policy 与 Human Gates](./docs/04-policy-and-human-gates.md)
- [05 存储、锁与恢复](./docs/05-storage-lock-and-recovery.md)
- [06 代码库组织与工程约束](./docs/06-codebase-organization.md)
- [07 Workspace 与多仓组织](./docs/07-workspace-and-multi-repo.md)
- [08 执行器适配](./docs/08-executor-adapters.md)
- [09 Hooks 与 Agent Runtime](./docs/09-hooks-and-agent-runtime.md)
- [10 模型路由与评估](./docs/10-model-routing-and-evaluation.md)
- [11 Skills 与 Connectors](./docs/11-skills-and-connectors.md)
- [12 验证与 Evidence](./docs/12-verification-and-evidence.md)
- [13 学习与知识治理](./docs/13-learning-and-knowledge.md)
- [14 生产接入与长期使用 SOP](./docs/14-production-adoption-sop.md)
- [15 四周开发路线](./docs/15-four-week-roadmap.md)
- [16 Rules 与代码合规](./docs/16-rules-and-code-compliance.md)
- [17 Instruction Projection](./docs/17-instruction-projection.md)
- [18 Memory Runtime 与记忆治理](./docs/18-memory-runtime-and-curation.md)
- [19 Agent Registry 与平台配置生成](./docs/19-agent-registry-and-platform-rendering.md)

## Planned CLI

正式 CLI 名称为 `liushi-harness`，提供短别名 `lh`。不注册过于通用的 `harness` 命令，避免与现有工具冲突。

```powershell
liushi-harness init --target codex --dry-run
liushi-harness doctor
liushi-harness task create --source <ticket-url>
```

## Release History

用户可感知变化由 Changesets 维护在 [CHANGELOG.md](./CHANGELOG.md)。
