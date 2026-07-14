import { describe, expect, it } from "vitest";

import { CodexHookEvent } from "../../src/application/index.js";
import { CodexHookHandlerType, createCodexHookProjection } from "../../src/infrastructure/index.js";

describe("Codex Hook projection", () => {
  it("只生成 command handler，并同时覆盖 PreToolUse 与 PostToolUse", () => {
    const projection = createCodexHookProjection();

    expect(projection).toEqual({
      hooks: {
        [CodexHookEvent.PreToolUse]: [
          {
            matcher: "^apply_patch$",
            hooks: [
              {
                type: CodexHookHandlerType.Command,
                command: "liushi-harness hook handle --executor codex",
                commandWindows: "liushi-harness hook handle --executor codex",
                statusMessage: "校验文件变更权限",
              },
            ],
          },
        ],
        [CodexHookEvent.PostToolUse]: [
          {
            matcher: "^apply_patch$",
            hooks: [
              {
                type: CodexHookHandlerType.Command,
                command: "liushi-harness hook handle --executor codex",
                commandWindows: "liushi-harness hook handle --executor codex",
                statusMessage: "记录文件变更结果",
              },
            ],
          },
        ],
      },
    });
  });

  it("允许显式覆盖命令与 matcher，且不引入未实现 handler", () => {
    const projection = createCodexHookProjection({
      command: "lh hook handle --executor codex",
      commandWindows: "lh hook handle --executor codex",
      matcher: "^(apply_patch|mcp__internal__.*)$",
    });

    expect(projection.hooks[CodexHookEvent.PreToolUse]?.[0]).toMatchObject({
      matcher: "^(apply_patch|mcp__internal__.*)$",
      hooks: [{ type: CodexHookHandlerType.Command, command: "lh hook handle --executor codex" }],
    });
    expect(JSON.stringify(projection)).not.toContain("prompt");
    expect(JSON.stringify(projection)).not.toContain("agent");
    expect(JSON.stringify(projection)).not.toContain("async");
  });
});
