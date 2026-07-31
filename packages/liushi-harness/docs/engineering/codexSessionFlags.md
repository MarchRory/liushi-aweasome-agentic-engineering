# Codex Agent Host Session Flags

## 范围

Session Flags 已迁入 `src/infrastructure/executors/codex/agentHost/sessionFlags/` 正式模块。模块只负责确定性组装 Codex CLI 的 `-c key=TOML` 参数、保护 Runtime keys、固定生产 Provider 与 reasoning 参数、声明受限 Hook、编码临时 Hook Trust，以及保留旧 exec 参数兼容导出。

通用 App Server builder 允许 Preflight 调用方传入 loopback Provider overrides，但不能覆盖正式 Runtime keys；生产 builder 使用固定 Provider、`responses` wire API、OpenAI auth、关闭 WebSocket 和 `medium` reasoning。App Server 参数始终以 `--strict-config app-server --stdio` 结尾。

## 安全边界

- Hook 只接受 `PreToolUse`、`PostToolUse`，matcher 只接受 `^apply_patch$`，每个事件只接受一个 `command` handler。
- Trust 只接受非空 key 与 `sha256:` 加 64 位小写十六进制摘要，按 key 排序并拒绝重复；内部状态使用 null-prototype 对象。
- Runtime keys 按 TOML 路径检查 exact、父路径和子路径冲突，调用方覆盖会 fail closed；不包含危险 bypass flags。
- `serializeTomlValue` 只处理字符串、布尔值、安全整数、数组和 plain object，拒绝循环、Date 等非 plain object、访问器、稀疏数组、隐藏字段、Symbol、孤立 UTF-16 surrogate 和其他非法值，且不会读取 getter；TOML basic string 会确定性转义受限控制字符。

## 为什么不引入完整 TOML 库

Codex 官方 `-c` 参数接收的是单个 `key=TOML` 配置值，而不是完整 TOML 文档。本模块只需要有限的内联标量、数组和 inline table 编码；受限实现更容易审计确定性排序、重复 key、循环和访问器边界，也避免引入完整文档解析器的额外语义和依赖。

## 与其他模块的边界

Session Flags 不实现 Preflight、Application Host 生命周期、Sandbox、Remote Control、File Change Approval、模型路由或 Workflow。Runtime Isolation 负责运行时目录、凭据和环境隔离；App Server Runner 负责 JSONL 协议、进程生命周期和 File Change Approval；已经正式化的 Preflight 在调用本模块后验证固定 loopback Provider、审批协议和进程退出；Application Host 负责编排 `preview -> approve -> run -> status`。这些职责保持独立，Session Flags 不吸收其他模块的状态或证据。

## 官方参考

- [Codex Config basics](https://learn.chatgpt.com/docs/config-file/config-basic.md)
- [Codex Advanced Config](https://learn.chatgpt.com/docs/config-file/config-advanced.md)
