---
"liushi-harness": minor
---

新增 Executor Compatibility Publication Bundle 的 create-only CLI 与原子文件发布端口。命令按精确 Matrix Digest 生成规范 JSON，只允许绝对输出路径，相同字节幂等复用，既有不同文件绝不覆盖，并以稳定回执暴露 Bundle、Matrix 和 Tarball Digest。
