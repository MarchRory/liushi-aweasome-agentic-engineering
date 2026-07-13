/** CLI 允许显式选择的 Verification 执行模式。 */
export enum CliVerificationMode {
  /** 不运行本地命令，并在没有注入结果时保持 fail closed。 */
  FailClosedMock = "fail_closed_mock",
  /** 在受信任的本地仓库工作树中运行计划声明的命令。 */
  LocalCommand = "local_command",
}
