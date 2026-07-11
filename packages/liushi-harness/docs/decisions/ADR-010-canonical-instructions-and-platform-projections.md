# ADR-010: Canonical Instruction 与平台投影

- Status: Accepted
- Date: 2026-07-11

## Context

Codex 使用 `AGENTS.md`，Claude-compatible 执行器通常使用 `CLAUDE.md`、Path Rule 和 Settings。直接分别维护这些文件会产生重复、冲突和厂商锁定，而且已有项目可能已经包含 Human 编写的指导文件。

Rule、Policy、Skill、Knowledge 和 Agent Prompt 如果再次复制到平台指导文件，还会形成无法确定优先级的长上下文。

## Decision

- `.liushi-harness/instructions/` 保存平台无关、Human 确认的 Canonical Instruction。
- Codex `AGENTS.md`、Claude-compatible `CLAUDE.md`/Path Rule 和 Generic InstructionBundle 均由确定性 Compiler 生成。
- 平台文件只保存短工作流、验证入口、停止条件和正式引用，不复制完整 Rule、Skill、Knowledge 或 Agent Prompt。
- Existing Human File 默认保持 External；首次接管和冲突更新必须生成 Diff Proposal。
- 每次投影记录 Source、Target、Adapter、Template、Base 和 Generated Digest，并进入 `managed-files.json`。
- Task-scoped Instruction 只进入 ContextBundle，不写入长期平台文件。
- 平台无法证明加载、Scope 或优先级时显式降级，不能宣称完整支持。

完整契约见 [Instruction Projection](../17-instruction-projection.md)。

## Consequences

- 多个执行器共享同一指导语义并可检测 Drift。
- 安装和升级增加 Projection Manifest、Ownership 和 Merge 处理成本。
- 平台文件保持短小，但 Agent 需要通过 Harness CLI/Skill 按需读取详细内容。
- Human 直接修改平台文件不会丢失，但必须通过 Candidate 流程反向进入 Canonical Source。
