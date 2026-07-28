import { describe, expect, it } from "vitest";

import { validateCodexHookProbe } from "../../../scripts/codexAgentPilot/host/validation/index.mjs";

describe("Codex Hook probe validation", () => {
  it.each([
    {
      platformFamily: "windows",
      platformOs: "windows",
      cwd: "C:\\repo",
      codexHome: "C:\\isolated-home",
      sourcePath: "C:\\<session-flags>\\config.toml",
      command: "powershell cli",
    },
    {
      platformFamily: "unix",
      platformOs: "linux",
      cwd: "/repo",
      codexHome: "/isolated-home",
      sourcePath: "/<session-flags>/config.toml",
      command: "node cli",
    },
  ])("在 $platformFamily 上精确绑定平台命令与 SessionFlags source", (platform) => {
    const candidateConfig = createCandidateConfig();
    const probe = createProbe(platform, candidateConfig);

    expect(
      validateCodexHookProbe({
        probe,
        candidateConfig,
        cwd: platform.cwd,
        codexHome: platform.codexHome,
        expectedTrustStatus: "trusted",
      }),
    ).toHaveLength(2);
  });

  it("平台命令与 Candidate 不一致时 fail closed", () => {
    const platform = {
      platformFamily: "windows",
      platformOs: "windows",
      cwd: "C:\\repo",
      codexHome: "C:\\isolated-home",
      sourcePath: "C:\\<session-flags>\\config.toml",
      command: "wrong",
    };

    expect(() =>
      validateCodexHookProbe({
        probe: createProbe(platform, createCandidateConfig()),
        candidateConfig: createCandidateConfig(),
        cwd: platform.cwd,
        codexHome: platform.codexHome,
        expectedTrustStatus: "trusted",
      }),
    ).toThrow("metadata");
  });
});

function createCandidateConfig() {
  const handler = (statusMessage) => ({
    type: "command",
    command: "node cli",
    commandWindows: "powershell cli",
    timeout: 30,
    statusMessage,
  });
  return {
    hooks: {
      PreToolUse: [{ matcher: "^apply_patch$", hooks: [handler("pre")] }],
      PostToolUse: [{ matcher: "^apply_patch$", hooks: [handler("post")] }],
    },
  };
}

function createProbe(platform, candidateConfig) {
  const events = [
    ["PreToolUse", "preToolUse", "pre_tool_use:0:0", "a"],
    ["PostToolUse", "postToolUse", "post_tool_use:0:0", "b"],
  ];
  return {
    initializeResult: {
      codexHome: platform.codexHome,
      platformFamily: platform.platformFamily,
      platformOs: platform.platformOs,
      userAgent: "liushi-harness/0.145.0",
    },
    hooksListResponse: {
      data: [
        {
          cwd: platform.cwd,
          hooks: events.map(([event, eventName, suffix, hash], index) => {
            const group = candidateConfig.hooks[event][0];
            const handler = group.hooks[0];
            return {
              key: `${platform.sourcePath}:${suffix}`,
              eventName,
              handlerType: "command",
              matcher: group.matcher,
              command: platform.command,
              timeoutSec: handler.timeout,
              statusMessage: handler.statusMessage,
              additionalContextLimit: null,
              sourcePath: platform.sourcePath,
              source: "sessionFlags",
              pluginId: null,
              displayOrder: index,
              enabled: true,
              isManaged: false,
              currentHash: `sha256:${hash.repeat(64)}`,
              trustStatus: "trusted",
            };
          }),
          warnings: [],
          errors: [],
        },
      ],
    },
    stderr: "",
  };
}
