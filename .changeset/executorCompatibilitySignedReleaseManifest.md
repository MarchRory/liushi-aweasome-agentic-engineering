---
"liushi-harness": minor
---

新增内容寻址 Signed Release Manifest Artifact、包内 Sigstore 签名 Use Case，以及由 Consumer Trust Profile 和显式 Trusted Root 驱动的完整离线验证链。P3b 与 P4b3 的包内签名入口新增可信 Release G6 Approval Authority：Authority 只按审批主题和制品摘要查询权威记录，调用方自报的 Human 记录不能直接触发签名。为避免同进程伪造 Authority 后使用环境凭据，Sign UseCase、Authority 回执工厂及签名依赖注入不从 npm 根或 `HarnessApplication` 暴露；公共包当前只提供离线 Verify，受控签名等待隔离 Release Host/CLI。当前切片不实现 Artifact Reader/Writer、CLI、Accepted Head 或安装选择。
