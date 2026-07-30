/** CLI 支持的规范命令标识。 */
export enum CliCommand {
  /** 尚未成功解析命令。 */
  Unknown = "unknown",
  /** 显示 CLI 使用方式。 */
  Help = "help",
  /** 检查 Runtime Store。 */
  Doctor = "doctor",
  /** 创建 Task。 */
  TaskCreate = "task.create",
  /** 查询 Task 状态。 */
  TaskStatus = "task.status",
  /** 提交 Artifact。 */
  ArtifactPropose = "artifact.propose",
  /** 记录 Human 决策。 */
  ApprovalDecide = "approval.decide",
  /** 解析 Project Rule Catalog。 */
  RulesResolve = "rules.resolve",
  /** 执行 Project Discovery。 */
  ProjectScan = "project.scan",
  /** 编译已批准的 Project Profile。 */
  ProfileCompile = "profile.compile",
  /** 执行 CodingTask Cell。 */
  CellRun = "cell.run",
  /** 激活外部 Agent CodingTask Session。 */
  CodingTaskSessionActivate = "coding_task.session.activate",
  /** 关闭外部 Agent CodingTask Session，并停在 CheckpointBound。 */
  CodingTaskSessionCloseout = "coding_task.session.closeout",
  /** 完成 CodingTask Session Delivery、Verification 与 PR-ready。 */
  CodingTaskSessionComplete = "coding_task.session.complete",
  /** 在 Session 启动前预登记 Pilot Metrics。 */
  CodingTaskSessionMetricsEnroll = "coding_task.session.metrics.enroll",
  /** 在 Verification 后结算 Pilot Metrics。 */
  CodingTaskSessionMetricsSettle = "coding_task.session.metrics.settle",
  /** 查询单 Session Pilot Metrics 原始事实。 */
  CodingTaskSessionMetricsReport = "coding_task.session.metrics.report",
  /** 评估 CodingTask Session Closeout Recovery。 */
  CodingTaskSessionCloseoutRecoveryAssess = "coding_task.session.closeout.recovery.assess",
  /** 执行 CodingTask Session Closeout Recovery。 */
  CodingTaskSessionCloseoutRecover = "coding_task.session.closeout.recover",
  /** 解析 CodingTask Session 的 Effective Closeout。 */
  CodingTaskSessionEffectiveCloseout = "coding_task.session.closeout.effective",
  /** 绑定 Hook 工作区。 */
  HookBind = "hook.bind",
  /** 处理执行器 Hook。 */
  HookHandle = "hook.handle",
  /** 输出 Codex Hook 配置。 */
  HookConfig = "hook.config",
  /** 探测 Codex Hook 能力。 */
  HookProbe = "hook.probe",
  /** 生成并持久化不修改 Repository 的 G0 安装计划。 */
  InitDryRun = "init.dry_run",
  /** 以 Human G0 批准应用精确安装计划。 */
  InitApply = "init.apply",
  /** 编译并持久化 Codex Executor Compatibility Matrix。 */
  ExecutorCompatibilityCompile = "executor.compatibility.compile",
  /** 按精确摘要查询 Executor Compatibility Matrix。 */
  ExecutorCompatibilityQuery = "executor.compatibility.query",
  /** 创建并原子发布 Executor Compatibility Bundle。 */
  ExecutorCompatibilityBundleCreate = "executor.compatibility.bundle.create",
}

/** CLI 输出格式。 */
export enum CliOutputFormat {
  /** 面向 Human 的简洁文本。 */
  Human = "human",
  /** 带 schema version 的 JSON。 */
  Json = "json",
}

/** 已解析命令共享的输出和 Store 选项。 */
export interface BaseCliCommand {
  /** 当前输出格式。 */
  readonly outputFormat: CliOutputFormat;
  /** 可选 Runtime Store 覆盖路径。 */
  readonly storeRoot?: string;
}
