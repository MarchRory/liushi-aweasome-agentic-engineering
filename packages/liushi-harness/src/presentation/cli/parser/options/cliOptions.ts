import { HarnessError, HarnessErrorCode } from "#common/index.js";

import { CliApprovalDecision } from "../../contracts/index.js";

/** CLI 支持的长选项。 */
export enum CliOptionName {
  /** 请求 JSON 输出。 */
  Json = "--json",
  /** 显示 Help。 */
  Help = "--help",
  /** 覆盖 Runtime Store。 */
  Store = "--store",
  /** 指定 Workspace ID。 */
  Workspace = "--workspace",
  /** 指定 Task ID。 */
  Task = "--task",
  /** 指定 Task 来源。 */
  Source = "--source",
  /** 指定本地 Human Actor ID。 */
  ActorId = "--actor-id",
  /** 指定 Artifact Proposal JSON 文件。 */
  File = "--file",
  /** 指定已批准的 ProjectProfileProposal Artifact ID。 */
  Artifact = "--artifact",
  /** 指定 Project Discovery Report JSON 文件。 */
  Report = "--report",
  /** 指定 DecisionRequest ID。 */
  Request = "--request",
  /** 指定 DecisionRequest Digest。 */
  RequestDigest = "--request-digest",
  /** 指定 Human 决策。 */
  Decision = "--decision",
  /** 指定 Approval 幂等键。 */
  IdempotencyKey = "--idempotency-key",
  /** 指定拒绝或豁免原因。 */
  Reason = "--reason",
  /** 指定 Project Rule Catalog JSON 文件。 */
  Catalog = "--catalog",
  /** 指定 Rule Resolution Context JSON 文件。 */
  Context = "--context",
}

const CLI_OPTION_BY_NAME = new Map<string, CliOptionName>(
  Object.values(CliOptionName).map((option) => [option, option]),
);

const CLI_APPROVAL_DECISION_BY_NAME = new Map<string, CliApprovalDecision>(
  Object.values(CliApprovalDecision).map((decision) => [decision, decision]),
);

/** 将外部长选项字符串解析为封闭 CliOptionName。 */
export function parseCliOptionName(value: string): CliOptionName {
  const option = CLI_OPTION_BY_NAME.get(value);
  if (option === undefined) {
    throw new HarnessError(HarnessErrorCode.InvalidInput, "Unknown CLI option.", {
      option: value,
    });
  }
  return option;
}

/** 判断 CLI 选项后是否必须紧跟非空值。 */
export function cliOptionRequiresValue(option: CliOptionName): boolean {
  return option !== CliOptionName.Json && option !== CliOptionName.Help;
}

/** 将外部 Human 决策字符串解析为封闭 CliApprovalDecision。 */
export function parseCliApprovalDecision(value: string): CliApprovalDecision {
  const decision = CLI_APPROVAL_DECISION_BY_NAME.get(value);
  if (decision === undefined) {
    throw new HarnessError(HarnessErrorCode.InvalidInput, "Unsupported approval decision.", {
      decision: value,
    });
  }
  return decision;
}

/** 创建带稳定 Option 诊断字段的 InvalidInput Error。 */
export function createInvalidCliOptionError(option: CliOptionName, message: string): HarnessError {
  return new HarnessError(HarnessErrorCode.InvalidInput, message, { option });
}
