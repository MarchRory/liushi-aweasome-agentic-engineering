# ADR-005: 模块化单体与 Clean/Hexagonal 分层

- Status: Accepted
- Date: 2026-07-11

## Context

`liushi-harness` 同时包含状态机、Policy、文件存储、Git、执行器、Connector、CLI、Hooks 和配置资产。如果按技术名词平铺在 `src/`，目录会快速膨胀，业务规则也容易泄漏到 Infrastructure。反过来，首月拆成多个 npm 包会增加构建、版本和循环依赖管理成本。

## Decision

首月使用单 npm 包内的模块化单体：

- `domain` 保存业务不变量。
- `application` 保存 Use Case 和 Port。
- `infrastructure` 保存所有 I/O 和第三方 Adapter。
- `presentation` 保存 CLI、Hook 和 JSON 边界。
- `common` 只保存稳定、无业务含义的 Shared Kernel。
- `bootstrap` 是唯一 Composition Root。

层内按 Task、Artifact、Gate、Workspace 和 Learning 等业务能力组织。使用自动化架构测试执行依赖方向、循环依赖、I/O 边界和目录预算。

## Consequences

- 代码归属和依赖方向可以机械检查。
- Infrastructure、Common 和执行器逻辑不会成为默认垃圾桶。
- 产生少量 Port、Mapper 和 Input/Output 文件，但这些文件有明确边界责任。
- 设计模式按问题采用，不设置模式数量目标。
- 拆分独立 npm 子包需要真实复用或独立发布需求，并新增 ADR。
