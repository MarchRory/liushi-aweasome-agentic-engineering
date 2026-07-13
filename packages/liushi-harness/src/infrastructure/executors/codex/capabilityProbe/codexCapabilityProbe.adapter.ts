import {
  CapabilityProbeExecutor,
  CODEX_CAPABILITY_PROBE_MAX_OUTPUT_BYTES,
  CODEX_CAPABILITY_PROBE_SCHEMA_VERSION,
  CODEX_CAPABILITY_PROBE_TIMEOUT_MS,
  CodexCapabilityName,
  type CodexCapabilityProbePort,
  type CodexCapabilityProbeReport,
  type CodexCapabilityProbeRequest,
  type CodexProbeCommandRecord,
} from "#application/index.js";
import { success, type HarnessError, type Result } from "#common/index.js";
import type { CommandRunner } from "#infrastructure/system/index.js";

import { CODEX_PROBE_COMMAND_DEFINITIONS } from "./codexCapabilityProbe.constants.js";
import {
  capabilityFromHelp,
  commandFinding,
  commandOutput,
  hookFrameworkFinding,
  isUsableCommandResult,
  overallProbeStatus,
  parseCodexVersion,
} from "./codexCapabilityProbe.utils.js";

/** 通过三个只读 Codex 命令生成静态能力报告。 */
export class CodexCapabilityProbeAdapter implements CodexCapabilityProbePort {
  public constructor(
    private readonly runner: CommandRunner,
    private readonly timeoutMs = CODEX_CAPABILITY_PROBE_TIMEOUT_MS,
  ) {}

  /** 探测失败时生成保守报告，不启动模型，也不写入配置。 */
  public async probe(
    request: CodexCapabilityProbeRequest,
  ): Promise<Result<CodexCapabilityProbeReport, HarnessError>> {
    const commands = createCommandRecords(request.executable);
    const [versionResult, helpResult, featuresResult] = await Promise.all(
      commands.map((command) =>
        this.runner.run({
          executable: command.executable,
          args: command.args,
          timeoutMs: this.timeoutMs,
          maxOutputBytes: CODEX_CAPABILITY_PROBE_MAX_OUTPUT_BYTES,
        }),
      ),
    );
    if (versionResult === undefined || helpResult === undefined || featuresResult === undefined) {
      throw new Error("Codex probe command definitions are incomplete.");
    }

    const versionText = commandOutput(versionResult);
    const helpText = commandOutput(helpResult);
    const featuresText = commandOutput(featuresResult);
    const version = isUsableCommandResult(versionResult)
      ? parseCodexVersion(versionText)
      : undefined;

    return success({
      schemaVersion: CODEX_CAPABILITY_PROBE_SCHEMA_VERSION,
      executor: CapabilityProbeExecutor.Codex,
      executable: request.executable,
      ...(versionText.length === 0 ? {} : { version: version ?? "unknown" }),
      commandHandler: commandFinding(
        CodexCapabilityName.CommandHandler,
        versionResult,
        version !== undefined,
        version === undefined ? "version output did not contain a semantic version" : versionText,
      ),
      hookFramework: hookFrameworkFinding(featuresResult, featuresText),
      preToolUse: capabilityFromHelp(
        CodexCapabilityName.PreToolUse,
        helpResult,
        helpText,
        /\b(?:pretooluse|pre-tool-use)\b/i,
      ),
      postToolUse: capabilityFromHelp(
        CodexCapabilityName.PostToolUse,
        helpResult,
        helpText,
        /\b(?:posttooluse|post-tool-use)\b/i,
      ),
      nativeStdin: capabilityFromHelp(
        CodexCapabilityName.NativeStdin,
        helpResult,
        helpText,
        /\b(?:stdin|standard input)\b/i,
      ),
      overallStatus: overallProbeStatus(
        versionResult,
        helpResult,
        featuresResult,
        version !== undefined,
      ),
      productionVerified: false,
      commands,
    });
  }
}

function createCommandRecords(executable: string): readonly CodexProbeCommandRecord[] {
  return CODEX_PROBE_COMMAND_DEFINITIONS.map((definition) => ({
    kind: definition.kind,
    executable,
    args: definition.args,
  }));
}
