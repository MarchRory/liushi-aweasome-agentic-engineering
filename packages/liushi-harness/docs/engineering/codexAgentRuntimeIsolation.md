# Codex Agent Runtime Isolation 技术方案

## 1. 目标

将固定公开项目 Pilot 已验证的 Codex Runtime 隔离能力从 `scripts/` 迁入正式
Infrastructure，使后续企业单仓 Pilot 可以复用同一套确定性安全边界。

本切片只解决 Agent 进程启动前后的本机 Runtime 隔离，不扩大 CodingTask、
Human Gate、Write Set 或 Verification 的既有授权范围。

## 2. 当前问题

固定公开项目 Pilot 已证明隔离目录、凭据副本、环境变量白名单和安全清理能够工作，
但实现位于 `scripts/codexAgentPilot/`。该位置只允许承载仓库维护和验证入口，不能继续
作为生产业务逻辑的权威实现。

如果企业 Pilot 继续复制这套实现，会产生两个无法接受的结果：

- 安全修复必须同时维护多份代码。
- 固定 Fixture 的项目常量可能渗入可配置 Host Runtime。

因此，本切片必须先建立唯一生产实现，再让旧 Pilot 通过兼容桥消费它。

## 3. 设计决策

### 3.1 归属

Runtime Isolation 放在：

```text
src/infrastructure/executors/codex/agentHost/runtimeIsolation/
```

它是 Codex 执行器的本机安全策略，不属于 Domain，也不进入 Common。

### 3.2 暂不引入 Application Port

本切片不新增通用 `AgentHostRuntimePort`。当前只有 Codex Runtime Isolation 的一个真实
实现，还没有由 Application 层协调的完整 Agent Host 生命周期。此时抽取跨执行器 Port
会提前冻结尚未验证的通用语义。

当后续 Application Host 需要以 `preview -> approve -> run -> status` 协调 Runtime、
App Server 和 Human Gate 时，再从已运行的调用边界提取窄 Port。该决定避免推测性抽象，
不妨碍本模块通过依赖注入完成测试。

### 3.3 单一权威实现

`scripts/codexAgentPilot/host/agentRunner/runtimeIsolation/` 只保留到构建产物的兼容桥。
目录下不得继续保留 Runtime Plan、凭据、环境、安全清理或平台逻辑的第二份实现。

固定 Pilot 是验证消费者，不是生产实现所有者。

## 4. 模块职责

| 模块               | 职责                                                       |
| ------------------ | ---------------------------------------------------------- |
| `plan`             | 生成并复验确定性 Runtime 路径与身份                        |
| `environment`      | 应用环境变量白名单并覆盖隔离目录                           |
| `auth`             | 快照宿主凭据元数据、复制凭据并验证源和副本身份             |
| `platform`         | 隔离 Windows ACL 与 POSIX 权限差异                         |
| `preparation`      | 按固定顺序准备目录、权限、凭据和环境                       |
| `cleanup`          | 只删除本次 Digest 所属的普通文件树                         |
| `externalSecurity` | 拒绝未纳入本次审批的外部 Skill、项目配置和 MCP 配置        |
| `adapter`          | 为 Host 调用方组合上述能力，不承载新的安全规则             |
| `contracts`        | 保存模块输入、计划、快照、准备结果与依赖的 TypeScript 契约 |

OS 分支只能存在于 `platform/`。其他模块不得直接判断 Windows、macOS 或 Linux。

## 5. 安全不变量

### 5.1 路径与身份

- `codexHomeSource` 必须是无 NUL 的 canonical 绝对普通目录。
- Runtime Root 固定为
  `<codexHomeSource parent>/.liushiHarnessRuntime/<taskId>/<digestHex>`。
- `taskId` 必须是安全的单路径段，不允许路径穿越、Windows 保留名或尾随点和空格。
- `sourceStateDigest` 必须是 `sha256:` 加 64 位小写十六进制。
- 准备、复验和清理必须从三个权威输入重建 Plan，不信任调用方提供的派生路径。

### 5.2 环境

- 子进程只继承显式白名单中的系统、代理和证书变量。
- `CODEX_HOME`、SQLite、临时目录和用户目录全部指向本次 Runtime。
- `OPENAI_API_KEY` 等未列入白名单的凭据变量不得隐式继承。
- `NO_UPDATE_NOTIFIER` 固定为 `1`。

### 5.3 凭据

- Harness 不读取、打印或持久化 `auth.json` 内容。
- 源凭据只记录文件身份、大小和时间元数据。
- 副本使用排他创建，权限收敛为仅当前 Runtime 所需范围。
- 复制后必须证明源和副本不是同一文件身份。
- Agent 结束后必须再次证明宿主源凭据与准备阶段快照一致。

### 5.4 外部配置

启动前关闭式拒绝：

- Host Home 下任意 `.agents/skills/**/SKILL.md`。
- Worktree 下 `.codex/config.toml`。
- Worktree 下任意 `.codex/skills/**/SKILL.md`。
- Worktree 根 `.mcp.json`。

普通 `AGENTS.md` 仍由既有项目指令机制处理，本检查不将其误判为外部 Skill。

### 5.5 清理

- 只能删除由本次 `taskId + sourceStateDigest` 重建出的精确 Runtime Root。
- 删除前递归拒绝符号链接、junction 和非普通文件节点。
- 仅在父目录为空时删除本 Task 和 Runtime 专用父目录。
- 删除结果未知或后置条件不成立时必须失败，不能伪报已清理。

## 6. 平台适配

POSIX 平台将 Runtime Root 权限设置为 `0700`。

Windows 平台必须：

1. 使用 `whoami.exe /user /fo csv /nh` 获取唯一 SID。
2. 拒绝无 SID 或多个 SID 的输出。
3. 使用 `icacls.exe` 关闭继承。
4. 只为当前 SID 和 `SYSTEM` 授予 Runtime Tree 完全控制。

命令必须以参数数组执行，禁止拼接 shell 字符串。

## 7. 失败与恢复

准备流程按以下顺序执行：

1. 复验源目录。
2. 捕获凭据元数据快照。
3. 证明目标 Runtime 不存在。
4. 创建专用父目录和子目录。
5. 收敛平台权限。
6. 排他复制凭据并复验隔离身份。
7. 返回隔离环境。

Root 创建后的任一步失败都必须尝试精确清理。原始错误保持主因；清理失败作为
`cleanupError` 附加，调用方必须把该状态视为需要人工检查，不能自动重试。

## 8. 测试与验收

本切片的完成门：

- Runtime Plan 对非法路径、Task ID 和 Digest 关闭式失败。
- 环境测试证明 Secret 变量不会继承，全部 Runtime 变量被覆盖。
- 凭据测试证明代码不读取内容、源漂移会阻断、复制不是同一文件身份。
- Windows 和 POSIX 平台策略均有确定性测试。
- 准备失败后不存在残留 Runtime Root。
- 清理拒绝伪造 Root、符号链接和 junction。
- 外部 Skill、Codex Project Config 和 MCP 配置均会阻断。
- 旧固定 Pilot 的原有测试继续通过，且只消费正式实现。
- TypeScript、ESLint、Prettier、架构测试和完整测试通过。

## 9. 非目标

本切片不实现：

- Codex App Server 协议、模型选择或 Turn 生命周期。
- 企业 PRD 解析、Skill、Memory、Wiki 或 Connector。
- Human Gate 自动批准或审批身份认证。
- Claude-compatible、CatPaw 或多执行器通用 Runtime。
- 多仓写入、跨仓补偿或 Studio。
- 企业 Pilot 效果结论。

## 10. 后续顺序

Runtime Isolation 后续的 App Server Runner 迁移已经完成，固定 Pilot 只通过构建产物桥消费正式实现。Session Flags 已作为独立 Agent Host Infrastructure 模块完成正式化；它只负责确定性 CLI overrides、Runtime key 路径保护、固定 Provider/reasoning、受限 Hook 和临时 Trust 编码。零模型 Preflight 也已作为独立模块完成正式化，以两个隔离的真实 Codex 进程验证 File Change Approval 正向放行、负向拒绝和零真实模型请求证据。Application Host 编排 `preview -> approve -> run -> status` 仍未完成。固定公开项目 Pilot 将持续作为回归 Fixture，企业单仓 Pilot 才负责产生真实生产与量化证据。
