---
"liushi-harness": minor
---

新增显式启用的本地 Verification Command Runner：以 `shell=false` 执行 Human/ProjectProfile 已确认的 Check，限制工作目录、环境变量、超时和输出，并验证 Git Root、Base Revision、Target Revision 与 HEAD 绑定。

默认 Composition Root 继续使用 fail-closed Mock；只有选择 `VerificationExecutionMode.LocalCommand` 才执行真实命令。原始输出仅用于生成摘要，不进入 EvidenceBundle。
