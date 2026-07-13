import type { HarnessError, Result } from "#common/index.js";
import type {
  CapabilityProbeExecutor,
  CapabilityProbeStatus,
  CodexCapabilityName,
  CodexProbeCommandKind,
} from "./capabilityProbe.enums.js";

/** 单次 Codex 静态探测命令的可审计记录。 */
export interface CodexProbeCommandRecord {
  /** 封闭命令种类。 */
  kind: CodexProbeCommandKind;
  /** 实际交给 Node spawn 的可执行文件。 */
  executable: string;
  /** 实际交给 Node spawn 的参数。 */
  args: readonly string[];
}

/** Codex capability probe 的显式应用输入。 */
export interface CodexCapabilityProbeRequest {
  /** 实际探测的可执行文件或命令名。 */
  executable: string;
}

/** 单项 Codex 能力的可审计结果。 */
export interface CapabilityProbeFinding {
  /** 能力名称。 */
  capability: CodexCapabilityName;
  /** 能力状态。 */
  status: CapabilityProbeStatus;
  /** 支撑状态判断的安全证据摘要。 */
  evidence: string;
}

/** Codex capability probe 的版本化报告。 */
export interface CodexCapabilityProbeReport {
  /** 报告契约版本。 */
  schemaVersion: string;
  /** 被探测的执行器。 */
  executor: CapabilityProbeExecutor;
  /** 可执行文件名称。 */
  executable: string;
  /** 从静态版本命令解析出的版本，未知时为空。 */
  version?: string;
  /** 命令处理器能力。 */
  commandHandler: CapabilityProbeFinding;
  /** PreToolUse hook 能力。 */
  preToolUse: CapabilityProbeFinding;
  /** PostToolUse hook 能力。 */
  postToolUse: CapabilityProbeFinding;
  /** Native stdin 能力。 */
  nativeStdin: CapabilityProbeFinding;
  /** Hook Framework 功能开关。 */
  hookFramework: CapabilityProbeFinding;
  /** 本次静态探测的整体状态，不代表生产支持。 */
  overallStatus: CapabilityProbeStatus;
  /** 是否允许据此宣称生产支持。 */
  productionVerified: boolean;
  /** 本次探测使用的安全静态命令。 */
  commands: readonly CodexProbeCommandRecord[];
}

/** Codex capability probe 应用端口。 */
export interface CodexCapabilityProbePort {
  /** 执行只读的 Codex 能力探测。 */
  probe(
    request: CodexCapabilityProbeRequest,
  ): Promise<Result<CodexCapabilityProbeReport, HarnessError>>;
}
