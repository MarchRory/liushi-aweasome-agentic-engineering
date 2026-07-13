import type { HarnessError, Result } from "#common/index.js";
import type {
  CodexCapabilityProbePort,
  CodexCapabilityProbeReport,
  CodexCapabilityProbeRequest,
} from "../../ports/capabilityProbe/index.js";

/** 执行 Codex 只读 capability probe 的 Use Case。 */
export class ProbeCodexCapabilitiesUseCase {
  public constructor(private readonly probePort: CodexCapabilityProbePort) {}

  /** 返回版本化、不可写入配置的探测报告。 */
  public async execute(
    request: CodexCapabilityProbeRequest,
  ): Promise<Result<CodexCapabilityProbeReport, HarnessError>> {
    return this.probePort.probe(request);
  }
}
