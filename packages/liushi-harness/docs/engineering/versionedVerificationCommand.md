# 版本化验证命令

## 当前闭环

`verification.run` 通过 Application Command Gateway 提供稳定的验证边界。命令绑定 Worktree Root Digest、目标分支、Base Revision、Target Revision 和 VerificationPlan Digest，并依次完成：

1. 校验 CodingTask 阶段、尝试次数和 Human 授权。
2. 取得仓库排他锁并写入 Action Intent。
3. 在非 Shell、环境变量白名单和资源限制下运行检查。
4. 持久化不可变 EvidenceBundle 并提交 Action Journal。
5. 将结果接受回 CodingTask，提交新的聚合版本。

`Passed` 完成当前验证阶段；`Failed` 按已确认的失败分类路由；`Blocked` 固定归类为环境失败。脏工作区、分支漂移、版本漂移以及检查命令修改工作区均 fail closed。

Session golden path 已通过 `completeCodingTaskSessionDelivery` 串联 G8 Profile、Applicable Rule、确定性影响面选择、版本化 Command、强一致 Evidence 和 PR-ready 装配。VerificationPlan v2 将 Profile Bundle、Repository Profile、Proposal、G8 Approval 与 Rule Bundle 来源纳入 Plan Digest；PR-ready 装配必须接收该预期 Plan Digest，不能只信任 Evidence 自报。

## 尚未覆盖

当前仍不包含 Flaky/受限重试策略、Waiver 接纳、Independent Verifier、多仓验证聚合和 Unknown Receipt 的 Human 恢复命令。外层 Command Receipt 或原子提交结果为 Unknown 时不得自动重跑；真实 Codex Pilot 完成前不声明生产闭环。
