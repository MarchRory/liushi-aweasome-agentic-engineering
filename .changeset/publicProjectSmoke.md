---
"liushi-harness": patch
---

新增固定公开 TypeScript 项目 Smoke：从真实 npm tarball 干净安装启动生产 CLI，在 `unjs/defu` 固定 Revision 完成预编排单文件 Mutation、Gate、受管 Worktree、Checkpoint、Local Verification、EvidenceBundle 与 PRReadyArtifact 正路径。
脚本验证两个独立 CLI 进程的幂等复用，并生成绑定 Tarball 摘要与运行环境且不含本机路径的证据 JSON；自动化 Approval 只证明 Gate 协议，不计作真实 Human Touch Time，也不代表 Agent 自主编码。
