import { describe, expect, it } from "vitest";

import { ActionOutcome } from "../../src/domain/actionJournal/index.js";
import { classifyCodexToolOutcome } from "../../src/infrastructure/executors/codex/index.js";

describe("Codex 工具结果分类", () => {
  it.each([
    { success: false },
    { ok: false },
    { status: "error" },
    { status: "FAILED" },
    { exit_code: 1 },
    { success: true, exit_code: 1 },
  ])("失败证据优先于其他字段：%j", (toolResponse) => {
    expect(classifyCodexToolOutcome(toolResponse)).toBe(ActionOutcome.Failed);
  });

  it.each([
    { success: true },
    { ok: true },
    { status: "success" },
    { status: "SUCCEEDED" },
    { status: "completed" },
    { status: "ok" },
    { exit_code: 0 },
  ])("只将明确成功证据归类为 succeeded：%j", (toolResponse) => {
    expect(classifyCodexToolOutcome(toolResponse)).toBe(ActionOutcome.Succeeded);
  });

  it.each([null, {}, "Done", [], { status: "unknown" }])(
    "未识别响应保守归类为 outcome_unknown：%j",
    (toolResponse) => {
      expect(classifyCodexToolOutcome(toolResponse)).toBe(ActionOutcome.OutcomeUnknown);
    },
  );
});
