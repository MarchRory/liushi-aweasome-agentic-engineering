---
"liushi-harness": patch
---

接入 TypeScript 7 原生编译器作为常规类型检查器，并保留 TypeScript 6 兼容性对照脚本。

根依赖遵循官方双轨方案：`typescript` 继续提供 TypeScript 6 编译器 API，`@typescript/native` 则清晰指向 TypeScript 7 GA 包。VS Code 工作区推荐并启用 TypeScript 7 原生语言服务器，不依赖 nightly 预览包。
