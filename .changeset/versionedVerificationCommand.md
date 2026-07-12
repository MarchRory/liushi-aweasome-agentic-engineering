---
"liushi-harness": minor
---

新增版本化验证命令：将命令预留、运行时根目录摘要、仓库锁、Action Journal、不可变 EvidenceBundle 和 CodingTask 状态接受闭合为一个应用服务。

本地验证会在执行前后校验 Git 版本、分支和工作区洁净状态；检查命令修改工作区时固定返回 Blocked，不会把被污染的结果接受为有效证据。
