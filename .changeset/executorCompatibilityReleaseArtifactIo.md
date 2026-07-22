---
"liushi-harness": minor
---

新增包内严格 Release Artifact Reader 与 create-only Writer：读取侧拒绝重复 JSON Key、非法 UTF-8、非规范字节、符号链接、长度和领域摘要漂移；写入侧绑定预配置输出根，只允许直接子文件，以原子硬链接、耐久化和精确字节复验实现首次创建或幂等复用。该切片不公开签名入口，也不包含隔离 Release Host、企业 Authority 或 CLI 接线。
