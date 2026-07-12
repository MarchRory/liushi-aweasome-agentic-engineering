import { describe, expect, it } from "vitest";

import { ResultStatus } from "../../src/common/index.js";
import {
  CodexHookEvent,
  parseApplyPatchTargets,
  parseCodexHookInput,
} from "../../src/infrastructure/executors/index.js";

const BASE_INPUT = {
  session_id: "session-1",
  cwd: "C:/workspace",
  model: "gpt-5",
  permission_mode: "default",
  turn_id: "turn-1",
  tool_name: "apply_patch",
  tool_use_id: "tool-1",
  tool_input: {
    command:
      "*** Begin Patch\n*** Update File: b.ts\n@@\n*** Update File: a.ts\n@@\n*** Update File: a.ts\n@@\n*** End Patch",
  },
};

describe("Codex Hook validation", () => {
  it("严格解析 PreToolUse 输入并对 apply_patch 目标排序去重", () => {
    const parsed = parseCodexHookInput({
      ...BASE_INPUT,
      hook_event_name: CodexHookEvent.PreToolUse,
    });
    expect(parsed.status).toBe(ResultStatus.Success);

    const targets = parseApplyPatchTargets(BASE_INPUT.tool_input);
    expect(targets.status).toBe(ResultStatus.Success);
    if (targets.status === ResultStatus.Success) {
      expect(targets.value.targets).toEqual(["a.ts", "b.ts"]);
    }
  });

  it("严格解析 PostToolUse，并拒绝未知字段和没有文件目标的 patch", () => {
    const parsed = parseCodexHookInput({
      ...BASE_INPUT,
      hook_event_name: CodexHookEvent.PostToolUse,
      tool_response: { success: true },
      unexpected: true,
    });
    expect(parsed.status).toBe(ResultStatus.Failure);

    const noTarget = parseApplyPatchTargets({ command: "echo no patch" });
    expect(noTarget.status).toBe(ResultStatus.Failure);
  });
});
