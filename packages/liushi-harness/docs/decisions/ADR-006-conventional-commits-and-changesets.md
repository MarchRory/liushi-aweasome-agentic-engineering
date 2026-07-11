# ADR-006: Conventional Commits 与 Changesets

- Status: Accepted
- Date: 2026-07-11

## Context

`liushi-harness` 将发布 npm 包，并可能由未来文档站展示版本变化。仅从 Git Commit 自动推断 SemVer 容易把工程过程与用户影响混为一谈，手工维护 Changelog 又容易漂移。

## Decision

- Commitlint 强制 Conventional Commits，表达工程变更类型和 Scope。
- Changesets 显式记录包的用户影响和 SemVer 级别。
- Changesets 生成包级 `CHANGELOG.md`，作为未来站点的人工 Review Source。
- 发布由 CI 生成 Tag、npm Package 和 Provenance，本地默认不发布正式版本。

## Consequences

- 每个公开行为变更需要 Changeset。
- Commit History 与 Changelog 各自保持清晰责任。
- 未来站点可以稳定消费 Markdown，并按需确定性生成 JSON。
- 增加少量 PR 操作，但避免自研版本和 Changelog 系统。
