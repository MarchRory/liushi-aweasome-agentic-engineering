---
"liushi-harness": minor
---

新增 Executor Compatibility Release Attestation Domain：固定 OIDC Issuer、具体 SAN、Runner Environment、源码仓库与完整 Revision 的 Publisher Identity Policy，生成绑定 Bundle、Matrix、Tarball、发布目标和策略摘要的不可变 Release Candidate，并要求真实 Human G6 DecisionRequest 与 ApprovalRecord 通过独立摘要重算后才能创建 in-toto Statement Draft。当前切片不引入 Sigstore 依赖，不执行签名、联网、发布或安装。
