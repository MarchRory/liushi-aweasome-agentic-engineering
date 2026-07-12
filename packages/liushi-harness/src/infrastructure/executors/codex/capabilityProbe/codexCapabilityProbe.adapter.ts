import { ResultStatus, success, type HarnessError, type Result } from "#common/index.js";
import {
  CapabilityProbeExecutor,
  CapabilityProbeStatus,
  CODEX_CAPABILITY_PROBE_SCHEMA_VERSION,
  CODEX_CAPABILITY_PROBE_TIMEOUT_MS,
  CodexCapabilityName,
  CodexProbeCommand,
  type CapabilityProbeFinding,
  type CodexCapabilityProbePort,
  type CodexCapabilityProbeReport,
} from "#application/index.js";
import type { CommandRunResult, CommandRunner } from "#infrastructure/system/index.js";

const COMMANDS = [CodexProbeCommand.Version, CodexProbeCommand.Help] as const;

/** 通过 codex 版本和帮助文本执行只读能力探测。 */
export class CodexCapabilityProbeAdapter implements CodexCapabilityProbePort {
  public constructor(
    private readonly runner: CommandRunner,
    private readonly timeoutMs = CODEX_CAPABILITY_PROBE_TIMEOUT_MS,
  ) {}

  /** 失败时 fail-closed 生成未验证报告，不启动模型、不写配置。 */
  public async probe(): Promise<Result<CodexCapabilityProbeReport, HarnessError>> {
    const version = await this.runner.run({
      executable: "codex",
      args: ["--version"],
      timeoutMs: this.timeoutMs,
    });
    const help = await this.runner.run({
      executable: "codex",
      args: ["--help"],
      timeoutMs: this.timeoutMs,
    });
    const versionText = version.status === ResultStatus.Success ? version.value.stdout.trim() : "";
    const helpText =
      help.status === ResultStatus.Success ? `${help.value.stdout}\n${help.value.stderr}` : "";
    const versionValue = versionText.length === 0 ? undefined : parseVersion(versionText);
    const versionKnown = versionValue !== undefined;
    const helpKnown =
      helpText.length > 0 && help.status === ResultStatus.Success && help.value.exitCode === 0;
    const evidence = helpKnown ? "codex --help output" : failureEvidence(help, version);
    return success({
      schemaVersion: CODEX_CAPABILITY_PROBE_SCHEMA_VERSION,
      executor: CapabilityProbeExecutor.Codex,
      executable: "codex",
      ...(versionText.length === 0 ? {} : { version: versionValue ?? "unknown" }),
      overallStatus: overallStatus(version, help, versionKnown, helpKnown),
      commandHandler: finding(
        CodexCapabilityName.CommandHandler,
        commandStatus(version, versionKnown),
        versionKnown ? CodexProbeCommand.Version : failureEvidence(version, version),
      ),
      preToolUse: capability(
        CodexCapabilityName.PreToolUse,
        helpText,
        helpKnown,
        /pretooluse|pre-tool-use/i,
        evidence,
        commandStatus(help, helpKnown),
      ),
      postToolUse: capability(
        CodexCapabilityName.PostToolUse,
        helpText,
        helpKnown,
        /posttooluse|post-tool-use/i,
        evidence,
        commandStatus(help, helpKnown),
      ),
      nativeStdin: capability(
        CodexCapabilityName.NativeStdin,
        helpText,
        helpKnown,
        /stdin|standard input/i,
        evidence,
        commandStatus(help, helpKnown),
      ),
      productionVerified: false,
      commands: COMMANDS,
    });
  }
}

function finding(
  capabilityName: CodexCapabilityName,
  status: CapabilityProbeStatus,
  evidence: string,
): CapabilityProbeFinding {
  return {
    capability: capabilityName,
    status,
    evidence,
  };
}

function capability(
  name: CodexCapabilityName,
  text: string,
  usable: boolean,
  pattern: RegExp,
  evidence: string,
  unavailableStatus: CapabilityProbeStatus,
): CapabilityProbeFinding {
  if (!usable) return { capability: name, status: unavailableStatus, evidence };
  return finding(
    name,
    pattern.test(text) ? CapabilityProbeStatus.Verified : CapabilityProbeStatus.Unverified,
    pattern.test(text) ? evidence : "help output did not declare capability",
  );
}

function parseVersion(text: string): string | undefined {
  return text.match(/\d+(?:\.\d+){1,3}(?:[-+][\w.-]+)?/)?.[0];
}

function commandStatus(
  result: Result<CommandRunResult, HarnessError>,
  known: boolean,
): CapabilityProbeStatus {
  if (result.status === ResultStatus.Failure) return CapabilityProbeStatus.Unavailable;
  if (result.value.launchError === "ENOENT") return CapabilityProbeStatus.Unavailable;
  if (known) return CapabilityProbeStatus.Verified;
  return CapabilityProbeStatus.Unverified;
}

function overallStatus(
  version: Result<CommandRunResult, HarnessError>,
  help: Result<CommandRunResult, HarnessError>,
  versionKnown: boolean,
  helpKnown: boolean,
): CapabilityProbeStatus {
  const statuses = [commandStatus(version, versionKnown), commandStatus(help, helpKnown)];
  if (statuses.includes(CapabilityProbeStatus.Unavailable)) {
    return CapabilityProbeStatus.Unavailable;
  }
  return versionKnown && helpKnown
    ? CapabilityProbeStatus.Verified
    : CapabilityProbeStatus.Unverified;
}

function failureEvidence(
  help: Result<CommandRunResult, HarnessError>,
  version: Result<CommandRunResult, HarnessError>,
): string {
  const launch =
    help.status === ResultStatus.Success
      ? help.value.launchError
      : version.status === ResultStatus.Success
        ? version.value.launchError
        : "runner_failure";
  return `static command unavailable: ${launch ?? "non-zero exit"}`;
}
