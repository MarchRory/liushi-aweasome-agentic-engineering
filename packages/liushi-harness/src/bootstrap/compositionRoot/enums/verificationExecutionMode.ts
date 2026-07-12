/** Composition Root 可启用的 Verification 执行模式。 */
export enum VerificationExecutionMode {
  /** 不运行外部命令，未配置结果固定 Blocked。 */
  FailClosedMock = "fail_closed_mock",
  /** 在本机 Worktree 中以 shell=false 运行 Plan 声明的命令。 */
  LocalCommand = "local_command",
}
