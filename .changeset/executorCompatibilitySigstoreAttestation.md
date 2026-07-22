---
"liushi-harness": minor
---

新增 Executor Compatibility Sigstore Attestation 签名与离线验证能力：在完整复验 Human G6 Draft 后使用官方 Sigstore 组件生成 DSSE Bundle 和内容寻址 Artifact，并使用调用方显式 Trusted Root 关闭式验证证书链、透明日志、可验证时间证据及精确发布者身份。

该能力当前通过 Library 与 Composition Root 提供，不包含 Attestation CLI、Trusted Release Manifest、远端发布或安装信任门。
