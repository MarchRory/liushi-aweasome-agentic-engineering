---
"liushi-harness": minor
---

将 CodingTask Cell Manifest 升级为 v2，Verification 步骤只接收不含目标 Revision 的 Plan Template，并在 Checkpoint Submission 后从权威 CodingTask Aggregate 绑定实际 Revision、重算 Command Digest。

该绑定在首次执行和已通过验证的跨进程重放中保持确定性，拒绝调用方注入目标 Revision、身份漂移和不兼容状态。
