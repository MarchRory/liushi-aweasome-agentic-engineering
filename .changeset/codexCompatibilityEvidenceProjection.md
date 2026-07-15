---
"liushi-harness": minor
---

将 Codex Host Result 升级为 v2，移除 `productionVerified`，增加 Host 受验状态、`not_evaluated` Matrix 声明边界、来源摘要、验证时间和运行时环境绑定；新增固定 Host Packet 协议、完整 Host OS 路径、唯一精确版本和内容寻址 Locator 脱敏校验，只投影 1 条 StaticProbe、4 条 SmokeTest 和 2 条 NegativeTest，不生成 ContractTest 或 ProductionE2e，也不把实现或旧版 Host 结果夸大为可发布版本矩阵。
