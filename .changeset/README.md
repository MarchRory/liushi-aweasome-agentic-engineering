# Changesets

每个影响公开包行为、API、配置、安装结果或用户文档的 Pull Request 都应包含一个 Changeset：

```powershell
pnpm changeset
```

Changeset 描述面向包使用者的变化，不复制 Commit Message。纯内部重构、测试和不影响用户的仓库文档可以不添加，但需要在 Pull Request 中说明。
