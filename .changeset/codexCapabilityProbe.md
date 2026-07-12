---
"liushi-harness": minor
---

新增只读 `hook probe --executor codex` 能力探测，报告 Codex 版本、静态命令、Hook 声明和 Native stdin 能力。找不到可执行文件、Access Denied、超时或未知版本均 fail closed，报告不会宣称真实生产支持，也不会启动模型或修改项目配置。
