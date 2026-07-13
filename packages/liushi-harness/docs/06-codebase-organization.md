# 06 代码库组织与工程约束

## 1. 目标

本规范在第一行业务代码出现前固定代码库结构，并通过自动化测试执行。目标不是追求目录数量或设计模式数量，而是保证：

- 一个文件和目录有单一、可解释的责任。
- Domain、Application、Infrastructure、Presentation 和 Common 边界清晰。
- 常量、错误、Schema、Port 和 Adapter 有稳定归属。
- 业务规则不泄漏到 CLI、Hook、文件系统或执行器适配器。
- 新增代码时可以根据规则判断放在哪里，而不是继续堆入已有目录。
- 复杂度、循环依赖和越层导入在 CI 阶段失败，而不是依赖 Reviewer 记忆。

### 1.1 当前实现状态

本章约束已作为当前代码库的强制工程基线：Clean Architecture 依赖方向、循环依赖、Composition Root、目录与文件职责、lower camelCase 文件名、纯 Barrel、300 行源码上限、类型 TSDoc、中文注释、ESLint、Prettier、Changesets 和双版本 TypeScript 检查均有自动化门禁。完整目标目录中的未启用业务模块只是预留结构，不代表对应运行时能力已经实现。

## 2. 架构风格

初始版本采用一个 npm 包内的模块化单体：

- **Clean Architecture** 定义依赖只能向内。
- **Hexagonal Architecture** 使用 Port 隔离文件系统、Git、执行器、Connector 和 Validator。
- **Domain-oriented modules** 在每层内部按 Task、Artifact、Gate、Rule、Instruction、Memory、Agent、Workspace、Learning 等能力分组。
- **Composition Root** 集中构造依赖，不使用 Service Locator 或全局可变 Singleton。

初始版本不拆成多个 npm 子包。只有模块具备独立发布、独立版本或被多个包真实复用的需求时，才通过 ADR 拆包。

## 3. 完整目录结构

```text
packages/liushi-harness/
├── package.json
├── tsconfig.json
├── README.md
├── src/
│   ├── domain/
│   │   ├── task/
│   │   ├── artifact/
│   │   ├── gate/
│   │   ├── rule/
│   │   ├── instruction/
│   │   ├── memory/
│   │   ├── agent/
│   │   ├── workspace/
│   │   └── learning/
│   ├── application/
│   │   ├── useCases/
│   │   ├── ports/
│   │   ├── dto/
│   │   └── services/
│   ├── infrastructure/
│   │   ├── persistence/
│   │   │   └── fileEventStore/
│   │   ├── vcs/
│   │   │   └── git/
│   │   ├── executors/
│   │   │   ├── codex/
│   │   │   └── claudeCompatible/
│   │   ├── connectors/
│   │   │   └── mcp/
│   │   ├── projections/
│   │   ├── memoryIndex/
│   │   ├── validation/
│   │   ├── observability/
│   │   └── system/
│   ├── presentation/
│   │   ├── cli/
│   │   ├── hooks/
│   │   └── json/
│   ├── common/
│   │   ├── constants/
│   │   ├── digest/
│   │   ├── errors/
│   │   ├── result/
│   │   ├── types/
│   │   ├── clock/
│   │   └── id/
│   └── bootstrap/
│       ├── cli/
│       ├── compositionRoot/
│       ├── runtimeConfig/
│       └── index.ts
├── integrations/
│   ├── skills/
│   ├── codex/
│   │   ├── plugin/
│   │   ├── hooks/
│   │   ├── agents/
│   │   ├── instructions/
│   │   └── templates/
│   ├── claudeCompatible/
│   │   ├── hooks/
│   │   ├── agents/
│   │   ├── instructions/
│   │   └── templates/
│   └── mcp/
├── config/
│   ├── profiles/
│   ├── policies/
│   ├── rules/
│   ├── instructions/
│   ├── memory/
│   ├── agents/
│   └── roles/
├── generated/
│   └── schemas/
├── tests/
│   ├── architecture/
│   ├── contract/
│   ├── integration/
│   ├── e2e/
│   ├── fixtures/
│   └── support/
├── scripts/
└── docs/
```

目录职责：

- `src/` 只保存可编译运行时代码。
- `integrations/` 保存向执行器安装的静态资产，不承载 Core 逻辑。
- `config/` 保存可分发的 Profile、Policy、Rule、Instruction、Memory Policy、Agent 和 Role 定义。
- `generated/` 只保存可再生成产物，禁止人工编辑。
- `tests/` 保存跨模块测试；模块单元测试与源码同目录。
- `scripts/` 只保存构建、发布和仓库维护脚本，不能成为隐藏业务入口。
- 包根目录使用文件白名单，禁止临时脚本、输出和说明文档持续堆积。

## 4. 依赖规则

| From             | 可以依赖                          | 禁止依赖                                            |
| ---------------- | --------------------------------- | --------------------------------------------------- |
| `common`         | 无状态纯函数和小型基础库          | Domain、Application、Infrastructure、Presentation   |
| `domain`         | `common`、允许的纯函数 Schema 库  | Application、Infrastructure、Presentation、Node I/O |
| `application`    | Domain、Common、Application Ports | Infrastructure、Presentation、具体执行器            |
| `infrastructure` | Application Ports、Domain、Common | Presentation、Bootstrap、其他 Adapter 内部实现      |
| `presentation`   | Application、公开 DTO、Common     | Infrastructure 具体实现、Domain 内部文件            |
| `bootstrap`      | 所有层的公开入口                  | 被其他任何层反向导入                                |

进一步约束：

- 跨业务模块只能通过模块根 `index.ts` 暴露的 Public API 导入。
- 每个包含 TypeScript 后代的源码目录必须有 `index.ts`，跨层和跨业务模块只能导入公开入口；内部目录入口不得承载逻辑。
- 禁止 `../../../../` 深层穿透；使用受控 Path Alias。
- Domain 和 Application 中禁止 `node:fs`、`node:child_process`、`process.env`、`console` 和执行器 SDK。
- Infrastructure Adapter 之间不得直接互调，通过 Application Port 或专用协调 Use Case 组合。
- 任何循环依赖均为 CI Error，不接受“运行正常”作为例外理由。

## 5. 职责归属决策树

新增代码按顺序判断：

1. 表达业务不变量、状态、Value Object 或领域判断：放 `domain/<module>`。
2. 编排一个用户目标、事务步骤或 Port：放 `application/useCases/<useCase>`，每个 Use Case 使用独立目录并通过目录根 `index.ts` 暴露公共 API。
3. 定义外部能力需求但不实现：放 `application/ports`。
4. 访问文件、Git、进程、网络、MCP、执行器或第三方库：放 `infrastructure`。
5. 解析 CLI、Hook 输入或渲染 JSON/Human 输出：放 `presentation`。
6. 只负责组装依赖和启动：放 `bootstrap`。
7. 同时被至少两个业务模块使用、语义稳定且不含业务判断的基础能力：才允许进入 `common`。

无法依据以上规则归属，说明责任尚未澄清，不能先放进 `common`、`helpers` 或 `utils` 再说。

## 6. 模块模板

### 6.1 Domain 模块

```text
domain/task/
├── task.aggregate.ts
├── taskState.valueObject.ts
├── taskTransition.policy.ts
├── task.events.ts
├── task.constants.ts
├── task.errors.ts
├── task.aggregate.test.ts
└── index.ts
```

约束：

- Aggregate 维护一致性边界，不负责 I/O。
- Value Object 在构造时校验，不允许无效值流入系统。
- Policy 保存确定性业务判断，不读取进程环境。
- Domain Event 使用过去式命名，只描述已经成立的事实。
- Domain Module 对外只暴露必要类型和行为。

### 6.2 Application Use Case

```text
application/useCases/approveGate/
├── approveGate.useCase.ts
├── approveGate.input.ts
├── approveGate.output.ts
├── approveGate.errors.ts
├── approveGate.useCase.test.ts
└── index.ts
```

一个 Use Case 对应一个明确用户目标。输入超过四个独立参数时使用 Input Object；输出使用 Result 或显式错误联合，不能依赖字符串匹配异常。

### 6.3 Infrastructure Adapter

```text
infrastructure/persistence/fileEventStore/
├── adapter/
│   ├── fileTaskRepository.adapter.ts
│   └── index.ts
├── constants/
├── contracts/
├── errors/
├── eventLog/
├── lock/
├── schema/
├── snapshot/
├── taskStore/
└── index.ts
```

Adapter 实现一个或一组高度内聚的 Port。外部数据必须在边界完成校验和映射，第三方错误必须转换为 Harness Error，不能泄漏到 Domain。

## 7. Common 不是垃圾桶

`common` 只允许以下类型：

- 稳定的 Primitive、Result、Clock 和 ID 抽象。
- 跨模块使用的错误基类和序列化类型。
- 真正全局且稳定的常量，例如 CLI Exit Code 和文件布局名。

禁止：

- generic `utils.ts`、`helpers.ts`、`misc.ts`、`shared-service.ts`，以及无法说明业务归属的同类文件。
- Task、Gate、Workspace 等领域规则。
- Codex、Claude-compatible、Git、MCP 或文件存储类型。
- 只被一个模块使用的“公共”函数。
- 为减少一行重复而抽取但语义不同的函数。

Common 新增导出必须有架构测试 Fixture，证明至少两个调用模块共享同一语义。使用次数不是唯一条件，但没有第二个真实调用方时默认不提升。

## 8. 常量与配置

### 8.1 归属规则

- Domain 专属常量保存在对应模块的 `*.constants.ts`。
- Infrastructure 专属常量保存在对应 Adapter 的 `*.constants.ts`。
- 只有跨模块稳定常量进入 `common/constants/`。
- 环境可变值属于 Runtime Config 或 Policy，不得伪装成常量。
- 一次性局部值保留在最小作用域，不为消除所有字面量制造全局常量。

### 8.2 枚举与开放标识符

封闭且有限的领域集合必须使用 String Enum，禁止使用字符串联合、数字枚举或 `as const` 对象模拟枚举。枚举类型和每个成员必须有 TSDoc：

```ts
/** Task 当前所在的业务阶段。 */
export enum TaskPhase {
  /** 正在发现并校验项目上下文。 */
  Context = "context",
  /** 正在澄清需求并形成 Requirement Contract。 */
  Requirements = "requirements",
  /** 正在生成技术方案、风险和所需 Gate。 */
  Planning = "planning",
  /** 正在批准的 Write Set 内修改代码。 */
  Implementation = "implementation",
  /** 正在执行验证并构建 Evidence Bundle。 */
  Verification = "verification",
  /** 已准备好由 Human Review、Merge 或 Delivery。 */
  Review = "review",
  /** 正在生成知识和 Skill 候选。 */
  Learning = "learning",
  /** Task 已满足最终完成条件。 */
  Done = "done",
}
```

适合枚举的类型包括 Artifact 状态、Evidence 来源、Claim 分类、Task Phase、Run State、审批结果、风险等级、Gate 结果和模型层级。

只有真正开放的扩展点才保留字符串，例如企业自定义 `roleId`、`connectorId` 和插件 Capability。此类值必须使用 Branded Type 或 Value Object，并由 Schema/Registry 校验，禁止裸字符串在 Core 中传播。

普通常量命名必须包含单位和语义，例如 `DEFAULT_LOCK_TIMEOUT_MS`，禁止 `TIMEOUT`、`VALUE` 等弱名称。不得建立一个包含全部项目常量的巨大 `constants.ts` 或全量 Barrel。

## 9. 错误处理

- 禁止 `throw "message"` 和依赖错误文本分支。
- Domain Error 表达业务拒绝，例如非法状态迁移。
- Application Error 表达 Use Case 失败，例如所需 Approval 缺失。
- Infrastructure Error 包装文件系统、Git、进程和 Connector 失败，并保留 `cause`。
- CLI 只负责将稳定 Error Code 映射到退出码和 Human/JSON 输出。
- 捕获异常后必须处理、转换或重新抛出，禁止空 `catch`。
- `unknown` 必须通过 Type Guard 收窄，生产代码默认禁止 `any`。

## 10. 设计模式使用边界

| 问题             | 采用模式                         | 使用位置                                   |
| ---------------- | -------------------------------- | ------------------------------------------ |
| 领域一致性       | Aggregate、Value Object          | Task、Artifact、Approval                   |
| 显式生命周期     | State Machine                    | Task Phase 和 RunState                     |
| 外部系统隔离     | Port and Adapter                 | Store、Git、Executor、Connector、Validator |
| 用户目标编排     | Use Case / Command Handler       | Application                                |
| 执行器与模型选择 | Strategy + Registry              | Adapter 和 Model Routing                   |
| 多规则合并       | Specification / Composite Policy | Gate Evaluation                            |
| 依赖创建         | Composition Root + Factory       | Bootstrap                                  |
| 跨仓非原子操作   | Saga                             | 后续跨仓写入版本                           |

禁止为了“有设计模式”增加抽象层。满足以下条件才新增 Interface 或抽象：

- 存在真实的第二个实现，或测试需要替换明确的外部 Port。
- 抽象稳定且比具体实现更接近业务语言。
- 能消除有意义的耦合，而不是只转发相同参数。

默认不使用 Service Locator、全局 Singleton、通用 Base Class、Abstract Factory 层级和反射式自动注册。确需采用必须新增 ADR。

## 11. 注释规范

代码应首先通过命名、类型和小函数表达意图。所有导出的 Type Alias、Interface、Class、Enum 和 Public Function 必须有说明责任与边界的 TSDoc；Enum 每个成员必须说明业务语义。非显然字段还必须说明单位、来源、可选原因或安全含义。

其他注释只用于代码无法独立表达的内容：

- 为什么必须保持某个不变量或执行顺序。
- 安全、兼容和恢复边界。
- 第三方缺陷、平台差异或临时 Workaround，并附来源或 Issue。
- 非显然算法、复杂度和证明思路。
- Public API 中调用方必须遵守的前置条件。

禁止：

- 重复代码含义，例如“设置变量”“遍历数组”。
- 用注释充当文件内章节标题来掩盖过长文件。
- 注释掉的旧实现，历史应交给 Git。
- 无 Owner、Issue 或删除条件的 TODO。
- 为显然的 Getter、构造函数或私有局部变量机械生成无信息量 TSDoc。

如果一段代码需要大量注释才能解释职责，优先重新命名、抽取 Value Object 或拆分 Use Case。

## 12. 文件与复杂度预算

预算用于发现职责扩散，不用于机械拆文件：

| 指标                 | Warning | Error |
| -------------------- | ------: | ----: |
| 单个源码文件有效行数 |     300 |   500 |
| 单个函数有效行数     |      60 |   100 |
| 圈复杂度             |      12 |    20 |
| `src` 下相对嵌套深度 |       5 |     7 |

Generated Schema、Migration、测试 Fixture 和声明表可以通过显式 Allowlist 例外。例外必须说明为何保持单文件比拆分更清晰，不能通过关闭全局规则绕过。

## 13. 命名与导出

- 源码文件名使用 lower camelCase，并用点分隔职责后缀：`.port.ts`、`.adapter.ts`、`.useCase.ts`、`.policy.ts`、`.schema.ts`、`.mapper.ts`、`.errors.ts`、`.constants.ts`。例如 `createTask.useCase.ts`、`fileTaskRepository.adapter.ts`。
- 每个业务模块和每个 Adapter 都必须由独立目录承载，不得把同一模块或 Adapter 的文件散落在上级目录。
- 业务模块目录和 Adapter 目录必须以根 `index.ts` 暴露公共 API；跨模块只能导入该公共 API，禁止导入内部文件。
- 类、类型和接口使用 PascalCase；函数和变量使用 camelCase；常量使用 UPPER_SNAKE_CASE。
- Interface 不添加 `I` 前缀；Port 使用 `EventStorePort` 这类业务名。
- Adapter 不添加 `Impl` 后缀，使用 `FileEventStoreAdapter`。
- 默认 Named Export。Default Export 只允许框架或工具配置明确要求的文件。
- 模块 Public API 由模块根 `index.ts` 控制，禁止导出内部 Mapper、第三方类型和测试工具。

## 14. 自动化架构测试

`tests/architecture/` 至少包含：

1. `dependencyDirection.test.ts`：检查层级依赖方向。
2. `noCycles.test.ts`：检查循环依赖。
3. `modulePublicApi.test.ts`：禁止跨模块深层导入。
4. `ioBoundary.test.ts`：禁止 Domain/Application 使用 Node I/O、环境变量和 Console。
5. `commonBoundary.test.ts`：Common 导出白名单和反向依赖检查。
6. `fileLayout.test.ts`：根目录白名单、源码与脚本命名、嵌套边界和 300 行源码预算；不设置仓库、目录或模块文件数上限。
7. `compositionRoot.test.ts`：只有 Bootstrap 可以构造具体 Adapter。
8. `generatedDrift.test.ts`：Schema 生成结果必须与源码一致。
9. `documentedTypes.test.ts`：导出类型、枚举及枚举成员必须包含有效 TSDoc。
10. `ruleResolution.test.ts`：Rule 优先级、Scope、Exception 和 Bundle Digest 必须确定性一致。
11. `instructionProjection.test.ts`：Canonical Instruction、平台文件和 Managed Digest 必须一致。
12. `memoryBoundary.test.ts`：Task State、Working Memory、Candidate 和 Active Knowledge 禁止混写。
13. `agentRegistry.test.ts`：AgentDefinition 不能绕过 Model、Permission、Skill、Memory 和 Eval Contract。

实现阶段使用 TypeScript AST/依赖图工具和 ESLint 执行，而不是正则扫描源码。CI 中架构测试与 Unit Test 同级，失败不能由 Agent 自动改为跳过。

## 15. TypeScript 基线

初始版本启用：

- `strict`、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`。
- Promise、Switch Exhaustiveness、Restricted Imports 和 Type-only Import 检查。
- 生产代码禁止显式 `any`、Floating Promise 和未处理的 Result。
- 封闭领域集合禁止字符串联合和 `as const` Enum 模拟写法。
- ESLint 强制导出类型和 Enum 文档，Prettier 负责唯一格式化结果。
- Domain 和 Application 禁止直接读取当前时间和生成随机 ID，通过 Clock/Id Port 注入。
- 所有 Port 至少有一个 Contract Test Suite，具体 Adapter 必须通过同一套 Contract。

## 16. 工程工具与提交发布

仓库统一使用：

- pnpm Workspace 管理包和精确 Lockfile。
- ESLint 执行 TypeScript、TSDoc、Promise、Import Boundary 和 Domain Enum 规则。
- Prettier 产生唯一代码、JSON、YAML 和 Markdown 格式。
- Markdownlint 检查技术方案和工程文档。
- Husky 与 lint-staged 执行快速 Pre-commit Gate。
- Commitlint 强制 Conventional Commits。
- Changesets 计算 SemVer 并生成包级 `CHANGELOG.md`。
- Vitest、TypeScript 和 tsup 分别执行测试、类型检查和构建。

完整规则见 [Commit、版本与 Changelog](./engineering/commit-and-release.md)。未来站点消费 Changesets 生成的包级 Changelog，不维护第二套手工版本历史。

## 17. Definition of Done

新增模块或 Use Case 在 Review-ready 前必须满足：

- 职责能用一句话描述，目录和文件名与职责一致。
- 依赖方向和 Public API 架构测试通过。
- 常量、错误和配置归属符合本规范。
- 没有新增 Generic Helper、无意义注释或隐藏 I/O。
- 使用的设计模式解决了明确问题，没有空转抽象。
- Unit、Contract 或 Integration 测试与风险匹配。
- 如果改变分层或模块边界，附带 ADR 和迁移说明。
- ApplicableRuleBundle 中的 Blocking Rule 全部通过，未决项进入 G8 而不是静默忽略。
- Instruction、Memory 和 Agent 平台文件由 Canonical Contract 生成，不直接散落手工配置。

首个实现切片必须先建立这些架构测试和一个纵向 Use Case Skeleton，再批量增加功能模块。
