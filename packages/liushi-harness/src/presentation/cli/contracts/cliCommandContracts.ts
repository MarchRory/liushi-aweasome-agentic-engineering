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
