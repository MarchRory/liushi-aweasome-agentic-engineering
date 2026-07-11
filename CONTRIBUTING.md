# Contributing

## Prerequisites

- Node.js 20.19 或更高版本。
- Corepack。

```powershell
corepack enable
pnpm install
pnpm check
```

## Commit

提交信息遵循 Conventional Commits：

```text
feat(harness): add workspace graph discovery
fix(harness): preserve approval digest during recovery
docs(harness): clarify business logic gate
```

Husky 在 Commit 前运行 lint-staged，并在 `commit-msg` 阶段运行 Commitlint。禁止使用 `--no-verify` 绕过失败；工具自身故障应先修复或在 Pull Request 中提供证据。

## Changeset

影响公开包行为、API、配置、安装产物或用户文档时运行：

```powershell
pnpm changeset
```

Changesets 负责版本计算和包级 `CHANGELOG.md`。Commit 记录工程过程，Changelog 只描述用户可感知变化，二者不能互相替代。

## Pull Request Gate

```powershell
pnpm format:check
pnpm lint
pnpm docs:lint
pnpm typecheck
pnpm test
pnpm build
```

修改架构边界、Hard Invariant、Artifact Contract 或兼容性声明时还必须更新对应技术方案和 ADR。
