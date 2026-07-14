---
"liushi-harness": patch
---

强化 Codex Hook 调用证据：Command Reservation 以摘要形式绑定 executor、session、turn、tool call、工具、目标与输入，幂等重放和 Receipt Completion 在来源漂移时关闭式拒绝。Action、Command、Correlation 和 Trace/Span 标识改由结构化 Workspace/Task invocation scope 摘要派生，消除分隔符字段边界碰撞。Host Smoke 结果门现在要求正向 Pre/Post 属于同一调用，并验证同会话负向用例的 Task 唯一挑战目标、独立 invocation 和无 Post 证据。

同时修复 Windows CRLF 配置导致精确项目 Trust 被误判缺失的问题；验证只归一化行尾，其他空白和内容漂移仍会被拒绝。
