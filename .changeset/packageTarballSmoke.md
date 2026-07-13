---
"liushi-harness": patch
---

新增跨平台发布物 Smoke：真实生成 tarball，在系统临时目录创建干净 consumer 并安装，验证 ESM、CJS、两个 CLI Bin、Runtime Doctor、许可证和必要发布文件。

CI 的 Windows 与 Ubuntu 矩阵以及正式发布命令都会执行同一确定性检查，失败时禁止继续发布。
