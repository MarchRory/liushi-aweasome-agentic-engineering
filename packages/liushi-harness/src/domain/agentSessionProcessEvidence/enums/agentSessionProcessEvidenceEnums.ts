/** Agent 进程证据支持的固定 Schema 版本。 */
export enum AgentSessionProcessEvidenceSchemaVersion {
  /** 首个 Agent Session Process Evidence 格式。 */
  V1 = "agent-session.process-evidence.v1",
}

/** 受信宿主承载 Agent 进程的固定表面。 */
export enum AgentSessionProcessHostSurface {
  /** 命令行宿主。 */
  Cli = "cli",
  /** 桌面应用宿主。 */
  Desktop = "desktop",
  /** 自动化运行器宿主。 */
  Automation = "automation",
}

/** 受信宿主观测到的进程终态。 */
export enum AgentSessionProcessOutcome {
  /** 进程成功完成。 */
  Completed = "completed",
  /** 进程以非零退出码失败。 */
  Failed = "failed",
  /** 进程超时。 */
  TimedOut = "timed_out",
  /** 进程被信号终止。 */
  Signaled = "signaled",
}
