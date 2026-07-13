import {
  CapabilityProbeStatus,
  CodexCapabilityName,
  type CapabilityProbeFinding,
} from "#application/index.js";
import { ResultStatus, type HarnessError, type Result } from "#common/index.js";
import type { CommandRunResult } from "#infrastructure/system/index.js";

/** 单次 Codex 静态命令的结构化结果。 */
type CodexCommandResult = Result<CommandRunResult, HarnessError>;

/** 合并成功命令的标准输出和错误输出。 */
export function commandOutput(result: CodexCommandResult): string {
  if (result.status === ResultStatus.Failure) return "";
  return [result.value.stdout, result.value.stderr]
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .join("\n");
}

/** 从 Codex 版本输出中提取语义版本。 */
export function parseCodexVersion(text: string): string | undefined {
  return text.match(/\d+(?:\.\d+){1,3}(?:[-+][\w.-]+)?/)?.[0];
}

/** 根据静态命令是否成功且产生有效证据返回能力 Finding。 */
export function commandFinding(
  capability: CodexCapabilityName,
  result: CodexCommandResult,
  evidenceKnown: boolean,
  evidence: string,
): CapabilityProbeFinding {
  const status = commandStatus(result, evidenceKnown);
  return {
    capability,
    status,
    evidence:
      status === CapabilityProbeStatus.Verified
        ? evidence
        : commandFailureEvidence(result, evidence),
  };
}

/** 只根据帮助文本中的显式声明判定 Hook 或 stdin 能力。 */
export function capabilityFromHelp(
  capability: CodexCapabilityName,
  result: CodexCommandResult,
  text: string,
  pattern: RegExp,
): CapabilityProbeFinding {
  if (!isUsableCommandResult(result)) {
    return commandFinding(capability, result, false, "help command unavailable");
  }
  const declared = hasPositiveCapabilityDeclaration(text, pattern);
  return {
    capability,
    status: declared ? CapabilityProbeStatus.Verified : CapabilityProbeStatus.Unverified,
    evidence: declared
      ? "help output contained a standalone positive capability declaration"
      : "help output did not contain a standalone positive capability declaration",
  };
}

/** 只接受 features list 中格式完整且启用的 hooks 行。 */
export function hookFrameworkFinding(
  result: CodexCommandResult,
  text: string,
): CapabilityProbeFinding {
  if (!isUsableCommandResult(result)) {
    return commandFinding(
      CodexCapabilityName.HookFramework,
      result,
      false,
      "features list command unavailable",
    );
  }
  const hooksLine = findHooksFeatureLine(text);
  if (hooksLine === undefined) {
    return {
      capability: CodexCapabilityName.HookFramework,
      status: CapabilityProbeStatus.Unverified,
      evidence: "features list did not contain an exact hooks feature line",
    };
  }
  return {
    capability: CodexCapabilityName.HookFramework,
    status: hooksLine.enabled ? CapabilityProbeStatus.Verified : CapabilityProbeStatus.Unverified,
    evidence: hooksLine.enabled
      ? `features list declared: ${hooksLine.line}`
      : `features list declared hooks disabled: ${hooksLine.line}`,
  };
}

/** 综合三个只读命令和版本解析结果计算探测状态。 */
export function overallProbeStatus(
  version: CodexCommandResult,
  help: CodexCommandResult,
  features: CodexCommandResult,
  versionKnown: boolean,
): CapabilityProbeStatus {
  const statuses = [
    commandStatus(version, versionKnown),
    commandStatus(help, commandOutput(help).length > 0),
    commandStatus(features, commandOutput(features).length > 0),
  ];
  if (statuses.includes(CapabilityProbeStatus.Unavailable)) {
    return CapabilityProbeStatus.Unavailable;
  }
  return statuses.every((status) => status === CapabilityProbeStatus.Verified)
    ? CapabilityProbeStatus.Verified
    : CapabilityProbeStatus.Unverified;
}

function commandStatus(result: CodexCommandResult, evidenceKnown: boolean): CapabilityProbeStatus {
  if (result.status === ResultStatus.Failure) return CapabilityProbeStatus.Unavailable;
  if (result.value.launchError === "ENOENT") return CapabilityProbeStatus.Unavailable;
  if (!isUsableCommandResult(result) || !evidenceKnown) {
    return CapabilityProbeStatus.Unverified;
  }
  return CapabilityProbeStatus.Verified;
}

/** 判断命令是否零退出、无启动错误且产生了有限的非空输出。 */
export function isUsableCommandResult(result: CodexCommandResult): boolean {
  return (
    result.status === ResultStatus.Success &&
    result.value.launchError === undefined &&
    result.value.exitCode === 0 &&
    commandOutput(result).length > 0
  );
}

function hasPositiveCapabilityDeclaration(text: string, pattern: RegExp): boolean {
  const negativePattern = /\b(?:disabled|removed|deprecated|unsupported|unavailable|not|no)\b/i;
  return text.split(/\r?\n/).some((line) => pattern.test(line) && !negativePattern.test(line));
}

function commandFailureEvidence(result: CodexCommandResult, fallback: string): string {
  if (result.status === ResultStatus.Failure) return "static command runner failed";
  if (result.value.launchError !== undefined) {
    return `static command unavailable: ${result.value.launchError}`;
  }
  if (result.value.exitCode !== 0) {
    return `static command exited with code ${String(result.value.exitCode)}`;
  }
  return fallback;
}

function findHooksFeatureLine(text: string): { line: string; enabled: boolean } | undefined {
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    const columns = line.split(/\s+/);
    if (
      columns.length === 3 &&
      columns[0] === "hooks" &&
      (columns[2] === "true" || columns[2] === "false")
    ) {
      return { line, enabled: columns[2] === "true" };
    }
  }
  return undefined;
}
