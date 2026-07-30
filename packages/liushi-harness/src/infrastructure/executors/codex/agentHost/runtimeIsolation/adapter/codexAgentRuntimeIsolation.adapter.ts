import { assertCodexAgentAuthSourceStable } from "../auth/index.js";
import { removeCodexAgentRuntime } from "../cleanup/index.js";
import type {
  CodexAgentAuthIntegrityOverrides,
  CodexAgentAuthSourceSnapshot,
  CodexAgentAuthVerificationResult,
  CodexAgentRuntimeCleanupOverrides,
  CodexAgentRuntimeIsolation,
  CodexAgentRuntimeIsolationOverrides,
  CodexAgentRuntimePlan,
  CodexAgentRuntimePlanInput,
  ExternalAgentSecurityInput,
  PreparedCodexAgentRuntime,
  RemovedCodexAgentRuntime,
} from "../contracts/index.js";
import { createCodexAgentEnvironment } from "../environment/index.js";
import { assertNoExternalAgentSkills } from "../externalSecurity/index.js";
import { createCodexAgentRuntimePlan } from "../plan/index.js";
import { prepareCodexAgentRuntime } from "../preparation/index.js";

/** Node 环境下的 Codex Runtime 隔离适配器。 */
export class NodeCodexAgentRuntimeIsolationAdapter implements CodexAgentRuntimeIsolation {
  /** 创建并校验确定性的 Runtime 计划。 */
  public createPlan(input: CodexAgentRuntimePlanInput): CodexAgentRuntimePlan {
    return createCodexAgentRuntimePlan(input);
  }

  /** 按白名单创建隔离进程环境。 */
  public createEnvironment(
    sourceEnv: Readonly<Record<string, string | undefined>>,
    plan: CodexAgentRuntimePlan,
  ): Readonly<Record<string, string>> {
    return createCodexAgentEnvironment(sourceEnv, plan);
  }

  /** 准备隔离 Runtime。 */
  public prepare(
    plan: CodexAgentRuntimePlan,
    overrides?: CodexAgentRuntimeIsolationOverrides,
  ): Promise<PreparedCodexAgentRuntime> {
    return prepareCodexAgentRuntime(plan, overrides);
  }

  /** 验证源 auth.json 在准备后保持稳定。 */
  public assertAuthSourceStable(
    plan: CodexAgentRuntimePlan,
    snapshot: CodexAgentAuthSourceSnapshot,
    overrides?: CodexAgentAuthIntegrityOverrides,
  ): Promise<CodexAgentAuthVerificationResult> {
    return assertCodexAgentAuthSourceStable(plan, snapshot, overrides);
  }

  /** 拒绝宿主或工作树中的外部 Agent 配置。 */
  public assertNoExternalAgentSkills(input: ExternalAgentSecurityInput): Promise<void> {
    return assertNoExternalAgentSkills(input);
  }

  /** 安全清理精确的 Runtime 根目录。 */
  public cleanup(
    plan: CodexAgentRuntimePlan,
    overrides?: CodexAgentRuntimeCleanupOverrides,
  ): Promise<RemovedCodexAgentRuntime> {
    return removeCodexAgentRuntime(plan, overrides);
  }
}
