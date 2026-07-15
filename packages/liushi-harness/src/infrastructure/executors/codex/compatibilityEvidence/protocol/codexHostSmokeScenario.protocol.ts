import {
  CODEX_HOST_SMOKE_NEGATIVE_EXPECTED_DECISION,
  CODEX_HOST_SMOKE_NEGATIVE_MARKER_PREFIX,
  CODEX_HOST_SMOKE_NEGATIVE_MARKER_SUFFIX,
  CODEX_HOST_SMOKE_NEGATIVE_PROMPT_PREFIX,
  CODEX_HOST_SMOKE_NEGATIVE_PROMPT_SUFFIX,
  CODEX_HOST_SMOKE_NEGATIVE_PROMPT_TARGET_MARKER_SEPARATOR,
  CODEX_HOST_SMOKE_NEGATIVE_SCENARIO_ID,
  CODEX_HOST_SMOKE_NEGATIVE_TARGET_PREFIX,
  CODEX_HOST_SMOKE_NEGATIVE_TARGET_SUFFIX,
  CODEX_HOST_SMOKE_POSITIVE_EXPECTED_DECISION,
  CODEX_HOST_SMOKE_POSITIVE_MARKER,
  CODEX_HOST_SMOKE_POSITIVE_PROMPT,
  CODEX_HOST_SMOKE_POSITIVE_SCENARIO_ID,
  CODEX_HOST_SMOKE_POSITIVE_TARGET,
} from "../constants/index.js";

/** Host Smoke 场景固定协议中需要逐项比较的字段。 */
export interface CodexHostSmokeScenarioProtocol {
  /** 场景的稳定协议标识。 */
  readonly id: string;
  /** 交给受验 Host 的完整固定提示词。 */
  readonly prompt: string;
  /** 场景唯一允许或尝试写入的目标。 */
  readonly target: string;
  /** 用于验证目标内容是否发生预期变化的固定标记。 */
  readonly marker: string;
  /** Host Hook 对该场景必须给出的固定决策。 */
  readonly expectedDecision: string;
}

/** 按任务标识生成正向与负向 Host Smoke 场景固定协议。 */
export function createCodexHostSmokeScenarioProtocol(
  taskId: string,
): readonly CodexHostSmokeScenarioProtocol[] {
  const negativeTarget = `${CODEX_HOST_SMOKE_NEGATIVE_TARGET_PREFIX}${taskId}${CODEX_HOST_SMOKE_NEGATIVE_TARGET_SUFFIX}`;
  const negativeMarker = `${CODEX_HOST_SMOKE_NEGATIVE_MARKER_PREFIX}${taskId}${CODEX_HOST_SMOKE_NEGATIVE_MARKER_SUFFIX}`;
  const negativePrompt = `${CODEX_HOST_SMOKE_NEGATIVE_PROMPT_PREFIX}${negativeTarget}${CODEX_HOST_SMOKE_NEGATIVE_PROMPT_TARGET_MARKER_SEPARATOR}${negativeMarker}${CODEX_HOST_SMOKE_NEGATIVE_PROMPT_SUFFIX}`;

  return [
    {
      id: CODEX_HOST_SMOKE_POSITIVE_SCENARIO_ID,
      prompt: CODEX_HOST_SMOKE_POSITIVE_PROMPT,
      target: CODEX_HOST_SMOKE_POSITIVE_TARGET,
      marker: CODEX_HOST_SMOKE_POSITIVE_MARKER,
      expectedDecision: CODEX_HOST_SMOKE_POSITIVE_EXPECTED_DECISION,
    },
    {
      id: CODEX_HOST_SMOKE_NEGATIVE_SCENARIO_ID,
      prompt: negativePrompt,
      target: negativeTarget,
      marker: negativeMarker,
      expectedDecision: CODEX_HOST_SMOKE_NEGATIVE_EXPECTED_DECISION,
    },
  ];
}

/** 比较 Host Smoke 场景顺序及全部固定协议字段。 */
export function matchesCodexHostSmokeScenarioProtocol(
  actual: readonly CodexHostSmokeScenarioProtocol[],
  taskId: string,
): boolean {
  const expected = createCodexHostSmokeScenarioProtocol(taskId);
  return (
    actual.length === expected.length &&
    actual.every((scenario, index) => {
      const expectedScenario = expected[index];
      return (
        expectedScenario !== undefined &&
        scenario.id === expectedScenario.id &&
        scenario.prompt === expectedScenario.prompt &&
        scenario.target === expectedScenario.target &&
        scenario.marker === expectedScenario.marker &&
        scenario.expectedDecision === expectedScenario.expectedDecision
      );
    })
  );
}
