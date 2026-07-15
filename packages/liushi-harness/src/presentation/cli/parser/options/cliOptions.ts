import { isAbsolute, resolve } from "node:path";

import {
  HookExecutorKind,
  parseInstallationTarget,
  type CreateInstallPlanInput,
} from "#application/index.js";
import { HarnessError, HarnessErrorCode, ResultStatus } from "#common/index.js";

import { CliApprovalDecision } from "../../contracts/index.js";
import { CliVerificationMode } from "../../enums/index.js";

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
  /** 指定 Hook 绑定的工作区根目录。 */
  Root = "--root",
  /** 指定单一写入 Repository ID。 */
  Repository = "--repository",
  /** 指定 Cell Verification 执行模式。 */
  VerificationMode = "--verification-mode",
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
  /** 指定已批准的 PlanRisk Artifact Digest。 */
  ArtifactDigest = "--artifact-digest",
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
  /** 指定 Hook 执行器实现。 */
  Executor = "--executor",
  /** 指定 Capability Probe 实际执行的可执行文件。 */
  Executable = "--executable",
  /** 指定安装目标执行器。 */
  Target = "--target",
  /** 仅创建 Runtime Store InstallPlan。 */
  DryRun = "--dry-run",
  /** 显式批准并应用指定 InstallPlan ID。 */
  Apply = "--apply",
  /** 显式批准的 InstallPlan 摘要。 */
  PlanDigest = "--plan-digest",
  /** 指定 Host Smoke Prepare Manifest 原始 JSON 文件。 */
  Prepare = "--prepare",
  /** 指定 Human Activation Plan 原始 JSON 文件。 */
  Activation = "--activation",
  /** 指定 Host Result 原始 JSON 文件。 */
  Result = "--result",
  /** 指定 Executor Compatibility Matrix Digest。 */
  MatrixDigest = "--matrix-digest",
}

const CLI_OPTION_BY_NAME = new Map<string, CliOptionName>(
  Object.values(CliOptionName).map((option) => [option, option]),
);

const CLI_APPROVAL_DECISION_BY_NAME = new Map<string, CliApprovalDecision>(
  Object.values(CliApprovalDecision).map((decision) => [decision, decision]),
);

const CLI_VERIFICATION_MODE_BY_NAME = new Map<string, CliVerificationMode>(
  Object.values(CliVerificationMode).map((mode) => [mode, mode]),
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
  return (
    option !== CliOptionName.Json &&
    option !== CliOptionName.Help &&
    option !== CliOptionName.DryRun
  );
}

/** 将外部安装目标解析为领域唯一的封闭枚举。 */
export function parseCliInstallationTarget(value: string): CreateInstallPlanInput["target"] {
  const target = parseInstallationTarget(value);
  if (target.status === ResultStatus.Failure) throw target.error;
  return target.value;
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

/** 将外部 Verification 模式解析为封闭 CliVerificationMode。 */
export function parseCliVerificationMode(value: string): CliVerificationMode {
  const mode = CLI_VERIFICATION_MODE_BY_NAME.get(value);
  if (mode === undefined) {
    throw new HarnessError(HarnessErrorCode.InvalidInput, "Unsupported verification mode.", {
      verificationMode: value,
    });
  }
  return mode;
}

/** 校验 CLI 路径为绝对路径并返回规范形式。 */
export function parseAbsolutePath(value: string, option: CliOptionName): string {
  if (!isAbsolute(value)) {
    throw createInvalidCliOptionError(option, "Option must be an absolute path.");
  }
  return resolve(value);
}

/** 将外部 Hook Executor 解析为当前已实现的封闭值。 */
export function parseHookExecutor(value: string): HookExecutorKind {
  const executor = Object.values(HookExecutorKind).find(
    (candidate) => candidate === (value as HookExecutorKind),
  );
  if (executor === undefined) {
    throw new HarnessError(HarnessErrorCode.InvalidInput, "Unsupported hook executor.", {
      executor: value,
    });
  }
  if (executor !== HookExecutorKind.Codex) {
    throw new HarnessError(HarnessErrorCode.InvalidInput, "Hook executor is not implemented.", {
      executor,
    });
  }
  return executor;
}

/** 校验并规范化显式 Capability Probe 可执行文件。 */
export function parseProbeExecutable(value: string): string {
  const executable = value.trim();
  if (executable.length === 0) {
    throw createInvalidCliOptionError(CliOptionName.Executable, "Executable must be non-empty.");
  }
  if (executable.includes("\0")) {
    throw createInvalidCliOptionError(CliOptionName.Executable, "Executable must not contain NUL.");
  }
  return executable;
}

/** 创建带稳定 Option 诊断字段的 InvalidInput Error。 */
export function createInvalidCliOptionError(option: CliOptionName, message: string): HarnessError {
  return new HarnessError(HarnessErrorCode.InvalidInput, message, { option });
}
