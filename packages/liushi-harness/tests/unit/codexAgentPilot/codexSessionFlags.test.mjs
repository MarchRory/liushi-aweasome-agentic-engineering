import { describe, expect, it } from "vitest";

import {
  CODEX_DISABLED_AGENT_FEATURES,
  CODEX_MODEL_PROVIDER_ID,
} from "../../../scripts/codexAgentPilot/constants/index.mjs";
import {
  createCodexAgentArguments,
  createCodexAgentAppServerArguments,
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
  it("精确固定受限 runtime overrides，并注入两类启动参数", () => {
    const runtimeOverrides = createCodexRuntimeOverrides();

    expect(CODEX_DISABLED_AGENT_FEATURES).toEqual([
      "apps",
      "artifact",
      "auth_elicitation",
      "browser_use",
      "browser_use_external",
      "browser_use_full_cdp_access",
      "code_mode",
      "code_mode_buffered_exec",
      "code_mode_host",
      "code_mode_only",
      "computer_use",
      "deferred_executor",
      "enable_mcp_apps",
      "executor_capability_discovery",
      "goals",
      "image_generation",
      "in_app_browser",
      "memories",
      "multi_agent",
      "multi_agent_v2",
      "plugin_sharing",
      "plugins",
      "remote_plugin",
      "request_permissions_tool",
      "shell_tool",
      "skill_mcp_dependency_install",
      "skill_search",
      "standalone_web_search",
      "tool_call_mcp_elicitation",
      "tool_suggest",
      "unified_exec",
      "workspace_dependencies",
    ]);
    expect(runtimeOverrides).toEqual([
      ...CODEX_DISABLED_AGENT_FEATURES.map((feature) => `features.${feature}=false`),
      'web_search="disabled"',
      "project_doc_max_bytes=0",
      'cli_auth_credentials_store="file"',
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

  it("生产 app-server 固定使用无 WebSocket provider 与 strict config", () => {
    const args = createCodexAgentAppServerArguments();
    const provider = args.find(
      (argument) =>
        typeof argument === "string" &&
        argument.startsWith(`model_providers.${CODEX_MODEL_PROVIDER_ID}=`),
    );

    expect(args).toContain(`model_provider="${CODEX_MODEL_PROVIDER_ID}"`);
    expect(provider).toContain('name="OpenAI"');
    expect(provider).toContain("requires_openai_auth=true");
    expect(provider).toContain("supports_websockets=false");
    expect(provider).not.toContain("base_url");
    expect(args.slice(-3)).toEqual(["--strict-config", "app-server", "--stdio"]);
    expect(args).not.toContain("--dangerously-bypass-approvals-and-sandbox");
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
    expect(args.indexOf("--ask-for-approval")).toBeLessThan(args.indexOf("exec"));
    expect(args.at(-1)).toBe("-");
  });
});
