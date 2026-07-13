# Commit、版本与 Changelog

## 职责分离

- Conventional Commit 描述一次工程变更的类型和范围。
- Changeset 描述对包使用者可感知的变化和 SemVer 级别。
- `CHANGELOG.md` 由 Changesets 聚合生成，不手工复制 Git Log。
- Git Tag 和 npm Package Version 必须一致。

## Commit 规则

格式：

```text
<type>(<scope>): <subject>
```

常用 Scope：`harness`、`docs`、`repo`、`ci`、`release` 和 `deps`。一个 Commit 只表达一个可独立 Review 的意图；生成代码、测试和文档应与对应行为变更保持可追踪关系。

## Changeset 规则

- `patch`：兼容的修复、行为调整和文档修正。
- `minor`：兼容的新命令、Artifact 字段或能力。
- `major`：不兼容的 CLI、Schema、Policy 或安装契约变化。
- 不影响公开包的内部重构可以不创建 Changeset。

每条 Changeset 必须说明用户影响、迁移要求和必要的兼容性边界，不能使用“update code”之类无信息描述。

## 站点消费

未来文档站首先消费每个包的 `CHANGELOG.md`，并使用 npm Version、Git Tag 和发布日期补充元数据。若后续需要筛选、搜索或多语言展示，再由确定性构建脚本将 Changelog 转换为版本化 JSON；Markdown 仍是唯一人工 Review 源，不维护第二份手工 Release 数据。

## 发布 Gate

发布前必须通过 Format、Lint、Markdown、Typecheck、Test、Architecture Test、Build、Package Tarball Smoke 和 Changeset Status。Package Smoke 必须真实生成 tarball，在 Workspace 外的临时 consumer 中通过 npm 安装，并验证 ESM、CJS、两个 CLI Bin、Doctor、License 与必要发布文件；`pack --dry-run` 不能替代该门禁。npm 发布由 CI 使用 Provenance 完成，个人本地环境默认不直接发布正式版本。

CI 在 Linux 和 Windows 上执行相同 Quality Gate 与 Package Smoke。GitHub Actions 使用完整 Commit SHA 固定第三方 Action，并由 Dependabot 提交升级 PR；Release Workflow 只在 `main` 上创建 Version PR 或发布 Changesets 已准备的版本，且 `changeset publish` 前再次执行 Package Smoke。
