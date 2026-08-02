---
"liushi-harness": patch
---

新增只读 `requirement analyze` 生产 CLI：通过显式 Codex 模型读取 PRD 与单仓代码上下文，生成经过领域复验的 Requirement Proposal，并将未知业务语义投影为 Human Battle 问题。命令不创建 Task、不写 Runtime Store、不修改 Repository；Codex 适配层使用严格 Structured Outputs 线格式并提供无敏感输出的稳定失败分类。
