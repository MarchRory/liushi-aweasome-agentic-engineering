import { describe, expect, it } from "vitest";

import {
  createCodexAgentArguments,
  createCodexAppServerArguments,
  createHookDeclarationOverrides,
  createHookTrustOverride,
  createCodexRuntimeOverrides,
} from "../../../scripts/codexAgentPilot/host/sessionFlags/index.mjs";

const candidateConfig = {
  hooks: {
    PreToolUse: [
      {
        matcher: "^apply_patch$",
        hooks: [
          {
            type: "command",
            command: "node cli",
            commandWindows: "powershell cli",
            timeout: 30,
            statusMessage: "pre",
          },
        ],
      },
    ],
    PostToolUse: [
      {
        matcher: "^apply_patch$",
        hooks: [
          {
            type: "command",
            command: "node cli",
            commandWindows: "powershell cli",
            timeout: 30,
            statusMessage: "post",
          },
        ],
      },
    ],
  },
};

describe("Codex SessionFlags", () => {
  it("精确固定 apply_patch-only runtime overrides，并注入两类启动参数", () => {
    const runtimeOverrides = createCodexRuntimeOverrides();

    expect(runtimeOverrides).toEqual([
      "features.shell_tool=false",
      "features.unified_exec=false",
      "features.apps=false",
      "features.multi_agent=false",
      "features.remote_plugin=false",
      "features.skill_mcp_dependency_install=false",
      'web_search="disabled"',
    ]);
    expect(createCodexAppServerArguments([])).toEqual([
      ...runtimeOverrides.flatMap((override) => ["-c", override]),
      "--strict-config",
      "app-server",
      "--stdio",
    ]);
    const agentArguments = createCodexAgentArguments({
      hookDeclarationOverrides: ["features.hooks=true"],
      hookTrustOverride: 'hooks.state={"hook"={enabled=true,trusted_hash="sha256:a"}}',
      worktreeRoot: "/worktree",
      model: "gpt-5.6-sol",
      sandbox: "workspace-write",
      approvalPolicy: "never",
    });
    const runtimeArguments = runtimeOverrides.flatMap((override) => ["-c", override]);
    const strictConfigIndex = agentArguments.indexOf("--strict-config");
    expect(
      agentArguments.slice(strictConfigIndex - runtimeArguments.length, strictConfigIndex),
    ).toEqual(runtimeArguments);
  });

  it("将固定 Hook 声明确定性编码为 TOML CLI override", () => {
    const overrides = createHookDeclarationOverrides(candidateConfig);

    expect(overrides).toEqual([
      "features.hooks=true",
      'hooks.PreToolUse=[{hooks=[{command="node cli",commandWindows="powershell cli",statusMessage="pre",timeout=30,type="command"}],matcher="^apply_patch$"}]',
      'hooks.PostToolUse=[{hooks=[{command="node cli",commandWindows="powershell cli",statusMessage="post",timeout=30,type="command"}],matcher="^apply_patch$"}]',
    ]);
    expect(createCodexAppServerArguments(overrides)).toEqual([
      "-c",
      overrides[0],
      "-c",
      overrides[1],
      "-c",
      overrides[2],
      ...createCodexRuntimeOverrides().flatMap((override) => ["-c", override]),
      "--strict-config",
      "app-server",
      "--stdio",
    ]);
  });

  it("拒绝调用方覆盖受限 Runtime key 或重复定义 SessionFlag", () => {
    expect(() => createCodexAppServerArguments(["features.shell_tool=true"])).toThrow(
      "不得由调用方覆盖",
    );
    expect(() =>
      createCodexAgentArguments({
        hookDeclarationOverrides: ["features.unified_exec=true"],
        hookTrustOverride: "hooks.state={}",
        worktreeRoot: "/worktree",
        model: "gpt-5.6-sol",
        sandbox: "workspace-write",
        approvalPolicy: "never",
      }),
    ).toThrow("不得由调用方覆盖");
    expect(() =>
      createCodexAppServerArguments(["hooks.PreToolUse=[]", "hooks.PreToolUse=[]"]),
    ).toThrow("不得重复");
    expect(() => createCodexAppServerArguments(["features . shell_tool=true"])).toThrow("key 无效");
    expect(() => createCodexAppServerArguments(['features."shell_tool"=true'])).toThrow("key 无效");
  });

  it("仅使用 Codex 返回的 key/currentHash 生成临时 Trust", () => {
    const trust = createHookTrustOverride([
      {
        key: "C:\\<session-flags>\\config.toml:pre_tool_use:0:0",
        currentHash: `sha256:${"a".repeat(64)}`,
      },
      {
        key: "C:\\<session-flags>\\config.toml:post_tool_use:0:0",
        currentHash: `sha256:${"b".repeat(64)}`,
      },
    ]);

    expect(trust).toContain('"C:\\\\<session-flags>\\\\config.toml:pre_tool_use:0:0"');
    expect(trust).toContain(`trusted_hash="sha256:${"a".repeat(64)}"`);
    expect(() =>
      createHookTrustOverride([
        {
          key: "duplicate",
          currentHash: `sha256:${"a".repeat(64)}`,
        },
        {
          key: "duplicate",
          currentHash: `sha256:${"a".repeat(64)}`,
        },
      ]),
    ).toThrow("重复");
  });

  it("生成精确 Agent 参数且不包含任何危险绕过", () => {
    const declarations = createHookDeclarationOverrides(candidateConfig);
    const trust = createHookTrustOverride([
      {
        key: "/<session-flags>/config.toml:pre_tool_use:0:0",
        currentHash: `sha256:${"a".repeat(64)}`,
      },
    ]);
    const args = createCodexAgentArguments({
      hookDeclarationOverrides: declarations,
      hookTrustOverride: trust,
      worktreeRoot: "/worktree",
      model: "gpt-5.6-sol",
      sandbox: "workspace-write",
      approvalPolicy: "never",
    });

    expect(args).toContain("--ignore-user-config");
    expect(args).toContain("--ignore-rules");
    expect(args).toContain("--ephemeral");
    expect(args).toContain("gpt-5.6-sol");
    expect(args).not.toContain("--dangerously-bypass-hook-trust");
    expect(args).not.toContain("--dangerously-bypass-approvals-and-sandbox");
    expect(args.at(-1)).toBe("-");
  });
});
