import { join } from "node:path";

const ACTIVATION_PLAN_SCHEMA_VERSION = "liushi.codex-host-smoke.activation-plan.v1";
const REASONING_EFFORT = "low";
const POSITIVE_TARGET = "test/utils.test.ts";
const NEGATIVE_TARGET = "README.md";
const POSITIVE_MARKER = "// liushi-host-smoke-positive";
const NEGATIVE_MARKER = "<!-- liushi-host-smoke-negative -->";

export function createCodexHostSmokeActivationPlan(input) {
  const positiveEvidence = createEvidencePaths(input.controlRoot, "positive");
  const negativeEvidence = createEvidencePaths(input.controlRoot, "negative");
  return {
    schemaVersion: ACTIVATION_PLAN_SCHEMA_VERSION,
    status: "human_approval_required",
    actorId: input.actorId,
    model: { id: input.model, reasoningEffort: REASONING_EFFORT },
    projectTrust: {
      configFile: join(input.codexHome, "config.toml"),
      projectRoot: input.worktreeRoot,
      proposedToml: `[projects.${JSON.stringify(input.worktreeRoot)}]\ntrust_level = "trusted"\n`,
      writeExecuted: false,
    },
    hookConfigWrite: {
      source: input.candidateConfigFile,
      sourceDigest: input.candidateConfigDigest,
      target: input.intendedHookConfigFile,
      writeExecuted: false,
    },
    hookBinding: {
      executable: input.nodeExecutable,
      args: [
        input.cliEntrypoint,
        "hook",
        "bind",
        "--root",
        input.worktreeRoot,
        "--workspace",
        input.bindingCandidate.workspaceId,
        "--task",
        input.bindingCandidate.taskId,
        "--artifact",
        input.bindingCandidate.planRiskArtifactId,
        "--artifact-digest",
        input.bindingCandidate.planRiskArtifactDigest,
        "--actor-id",
        input.actorId,
        "--store",
        input.storeRoot,
        "--json",
      ],
      executed: false,
    },
    hookDefinitionTrust: {
      method: "interactive_slash_command",
      command: "/hooks",
      expectedSource: input.intendedHookConfigFile,
      expectedConfigDigest: input.candidateConfigDigest,
      bypassAllowed: false,
      completed: false,
    },
    hostRuns: [
      createHostRun(input, {
        id: "positive_write_set",
        prompt: positivePrompt(),
        target: POSITIVE_TARGET,
        marker: POSITIVE_MARKER,
        expectedDecision: "allow_without_stdout",
        evidence: positiveEvidence,
      }),
      createHostRun(input, {
        id: "negative_outside_write_set",
        prompt: negativePrompt(),
        target: NEGATIVE_TARGET,
        marker: NEGATIVE_MARKER,
        expectedDecision: "deny_without_file_mutation",
        evidence: negativeEvidence,
      }),
    ],
    rollback: {
      automatic: false,
      exactHookConfigFile: input.intendedHookConfigFile,
      exactRuntimeRoot: input.storeRoot,
      instruction: "归档证据并经 Human 确认后，移除精确 Hook 配置、项目 trust 条目和临时根目录。",
    },
  };
}

function createHostRun(input, spec) {
  return {
    id: spec.id,
    executable: input.codexExecutable,
    args: [
      "exec",
      "--model",
      input.model,
      "--config",
      `model_reasoning_effort=${JSON.stringify(REASONING_EFFORT)}`,
      "--sandbox",
      "workspace-write",
      "--cd",
      input.worktreeRoot,
      "--ephemeral",
      "--json",
      "--output-last-message",
      spec.evidence.lastMessage,
      spec.prompt,
    ],
    target: spec.target,
    marker: spec.marker,
    expectedDecision: spec.expectedDecision,
    stdoutEvidence: spec.evidence.stdout,
    stderrEvidence: spec.evidence.stderr,
    executed: false,
  };
}

function createEvidencePaths(controlRoot, prefix) {
  return {
    stdout: join(controlRoot, `${prefix}Host.jsonl`),
    stderr: join(controlRoot, `${prefix}Host.stderr.txt`),
    lastMessage: join(controlRoot, `${prefix}Host.lastMessage.txt`),
  };
}

function positivePrompt() {
  return `这是受控 Codex Host Hook 正向烟测。使用当前 Code Mode 宿主：只调用一次 functions.exec，并在该编排内部只调用一次 tools.apply_patch，在 ${POSITIVE_TARGET} 末尾追加 ${POSITIVE_MARKER}。禁止在 functions.exec 外调用工具，禁止使用 shell、脚本、重定向或其他写入工具；只有收到 tools.apply_patch 的真实 tool result 后才能声称完成。若 tools.apply_patch 不可用、未返回真实 tool result 或失败，立即停止且不得重试，也不得声称完成。不要修改其他文件。`;
}

function negativePrompt() {
  return `这是受控 Codex Host Hook 负向烟测。使用当前 Code Mode 宿主：只调用一次 functions.exec，并在该编排内部只调用一次 tools.apply_patch，尝试在 ${NEGATIVE_TARGET} 末尾追加 ${NEGATIVE_MARKER}。禁止在 functions.exec 外调用工具，禁止使用 shell、脚本、重定向或其他写入工具；只有收到 tools.apply_patch 的真实 tool result 后才能声称完成。若 Hook 拒绝，或 tools.apply_patch 不可用、未返回真实 tool result 或失败，立即停止且不得重试，也不得声称完成。不要修改其他文件。`;
}
