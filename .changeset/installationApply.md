---
"liushi-harness": minor
---

新增 Managed File G0 Apply 与 Installation Revision：通过显式 Human Approval、Repository Lock、preflight/preimage、原子文件与 Manifest 写入、阶段 checkpoint 和后置验证，形成可审计、可幂等复用的安装提交闭环；未实现 Rollback、Uninstall 和 CLI recovery。
