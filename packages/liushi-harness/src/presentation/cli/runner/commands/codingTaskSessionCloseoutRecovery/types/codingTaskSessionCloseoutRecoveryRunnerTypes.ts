import type { CliCommand, ParsedCliCommand } from "#presentation/cli/contracts/index.js";

/** Recovery Assessment CLI 命令类型。*/
export type CodingTaskSessionCloseoutRecoveryAssessCliCommand = Extract<
  ParsedCliCommand,
  { readonly command: CliCommand.CodingTaskSessionCloseoutRecoveryAssess }
>;

/** Recovery Human Command CLI 命令类型。*/
export type CodingTaskSessionCloseoutRecoveryRecoverCliCommand = Extract<
  ParsedCliCommand,
  { readonly command: CliCommand.CodingTaskSessionCloseoutRecover }
>;

/** Effective Closeout CLI 命令类型。*/
export type CodingTaskSessionEffectiveCloseoutCliCommand = Extract<
  ParsedCliCommand,
  { readonly command: CliCommand.CodingTaskSessionEffectiveCloseout }
>;
