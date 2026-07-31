import { describe, expect, it } from "vitest";

import {
  CODEX_DISABLED_AGENT_FEATURES,
  CODEX_MODEL_PROVIDER_ID,
  CODEX_RESTRICTED_RUNTIME_OVERRIDES,
  CodexDisabledAgentFeature,
  createCodexAgentAppServerArguments,
  createCodexAppServerArguments,
  createHookDeclarationOverrides,
  createHookTrustOverride,
  serializeTomlValue,
} from "../../../src/infrastructure/executors/codex/agentHost/sessionFlags/index.js";

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

describe("正式 Codex Session Flags", () => {
  it("从 enum 派生旧兼容常量并保持顺序", () => {
    expect(CODEX_DISABLED_AGENT_FEATURES).toEqual(Object.values(CodexDisabledAgentFeature));
    expect(CODEX_RESTRICTED_RUNTIME_OVERRIDES).toEqual([
      ...CODEX_DISABLED_AGENT_FEATURES.map((feature) => `features.${feature}=false`),
      'web_search="disabled"',
      "project_doc_max_bytes=0",
      'cli_auth_credentials_store="file"',
    ]);
  });

  it("保护 Runtime keys、拒绝重复和非法 key", () => {
    expect(() => createCodexAppServerArguments(["features.shell_tool=true"])).toThrow(
      "不得由调用方覆盖",
    );
    expect(() => createCodexAppServerArguments(["features={shell_tool=true}"])).toThrow(
      "不得由调用方覆盖",
    );
    expect(() => createCodexAppServerArguments(["features.shell_tool.extra=true"])).toThrow(
      "不得由调用方覆盖",
    );
    expect(() => createCodexAppServerArguments(["model=true", "model=true"])).toThrow("不得重复");
    expect(() => createCodexAppServerArguments(["model=true", "model.foo=true"])).toThrow(
      "父子路径冲突",
    );
    expect(() => createCodexAppServerArguments(["features . shell_tool=true"])).toThrow("key 无效");
    expect(() => createCodexAppServerArguments(['features."shell_tool"=true'])).toThrow("key 无效");
    expect(() => createCodexAppServerArguments(["features.shell_tool=true\n"])).toThrow("无效");
  });

  it("允许通用 builder 接收 loopback Provider overrides 并保持 app-server 尾部", () => {
    const args = createCodexAppServerArguments([
      'model_provider="loopback"',
      'model_providers.loopback={name="Loopback"}',
    ]);

    expect(args.slice(-3)).toEqual(["--strict-config", "app-server", "--stdio"]);
    expect(args).toContain('model_provider="loopback"');
    expect(args).not.toContain("--dangerously-bypass-approvals-and-sandbox");
  });

  it("固定生产 Provider、reasoning 和 Runtime overrides", () => {
    const args = createCodexAgentAppServerArguments();
    expect(args).toContain(`model_provider="${CODEX_MODEL_PROVIDER_ID}"`);
    expect(args).toContain('model_reasoning_effort="medium"');
    expect(args.some((argument) => argument.includes('name="OpenAI"'))).toBe(true);
    expect(args).not.toContain("--dangerously-bypass-approvals-and-sandbox");
    expect(args).not.toContain("--dangerously-bypass-hook-trust");
  });

  it("保持 Hook 事件、matcher 和单 command handler 的闭集", () => {
    expect(createHookDeclarationOverrides(candidateConfig)).toEqual([
      "features.hooks=true",
      'hooks.PreToolUse=[{hooks=[{command="node cli",commandWindows="powershell cli",statusMessage="pre",timeout=30,type="command"}],matcher="^apply_patch$"}]',
      'hooks.PostToolUse=[{hooks=[{command="node cli",commandWindows="powershell cli",statusMessage="post",timeout=30,type="command"}],matcher="^apply_patch$"}]',
    ]);
    expect(() =>
      createHookDeclarationOverrides({
        hooks: { ...candidateConfig.hooks, Other: candidateConfig.hooks.PreToolUse },
      }),
    ).toThrow("字段集合");
    expect(() =>
      createHookDeclarationOverrides({
        hooks: {
          ...candidateConfig.hooks,
          PreToolUse: [
            {
              ...candidateConfig.hooks.PreToolUse[0]!,
              hooks: [
                ...candidateConfig.hooks.PreToolUse[0]!.hooks,
                candidateConfig.hooks.PreToolUse[0]!.hooks[0],
              ],
            },
          ],
        },
      }),
    ).toThrow("固定 command");
  });

  it("Trust 按 key 排序并拒绝重复或非法摘要", () => {
    const digest = `sha256:${"a".repeat(64)}`;
    const trust = createHookTrustOverride([
      { key: "z", currentHash: digest },
      { key: "a", currentHash: `sha256:${"b".repeat(64)}` },
    ]);
    expect(trust.indexOf("a=")).toBeLessThan(trust.indexOf("z="));
    expect(() =>
      createHookTrustOverride([
        { key: "duplicate", currentHash: digest },
        { key: "duplicate", currentHash: digest },
      ]),
    ).toThrow("不得重复");
    expect(() => createHookTrustOverride([{ key: "x", currentHash: "sha256:bad" }])).toThrow(
      "无效",
    );
    const prototypeKeyTrust = createHookTrustOverride([{ key: "__proto__", currentHash: digest }]);
    expect(prototypeKeyTrust).toContain("__proto__=");
  });

  it("Trust arrays fail closed before map, sparse, or accessor reads", () => {
    const digest = `sha256:${"a".repeat(64)}`;
    const hooks = [{ key: "hook", currentHash: digest }];
    let mapReads = 0;
    Object.defineProperty(hooks, "map", {
      enumerable: true,
      get: () => {
        mapReads += 1;
        return Array.prototype.map;
      },
    });
    expect(() => createHookTrustOverride(hooks)).toThrow("访问器");
    expect(mapReads).toBe(0);

    expect(() => createHookTrustOverride(new Array(1))).toThrow("稀疏");

    const accessorHooks = new Array(1);
    let indexReads = 0;
    Object.defineProperty(accessorHooks, "0", {
      enumerable: true,
      get: () => {
        indexReads += 1;
        return { key: "hook", currentHash: digest };
      },
    });
    expect(() => createHookTrustOverride(accessorHooks)).toThrow("访问器");
    expect(indexReads).toBe(0);
  });

  it("Hook groups and handlers reject sparse or accessor arrays", () => {
    const sparseGroups = new Array(1);
    expect(() =>
      createHookDeclarationOverrides({
        hooks: { ...candidateConfig.hooks, PreToolUse: sparseGroups },
      }),
    ).toThrow("稀疏");

    const accessorGroups = new Array(1);
    let groupReads = 0;
    Object.defineProperty(accessorGroups, "0", {
      enumerable: true,
      get: () => {
        groupReads += 1;
        return candidateConfig.hooks.PreToolUse[0];
      },
    });
    expect(() =>
      createHookDeclarationOverrides({
        hooks: { ...candidateConfig.hooks, PreToolUse: accessorGroups },
      }),
    ).toThrow("访问器");
    expect(groupReads).toBe(0);

    const sparseHandlers = new Array(1);
    const group = candidateConfig.hooks.PreToolUse[0]!;
    expect(() =>
      createHookDeclarationOverrides({
        hooks: {
          ...candidateConfig.hooks,
          PreToolUse: [{ ...group, hooks: sparseHandlers }],
        },
      }),
    ).toThrow("稀疏");

    const accessorHandlers = new Array(1);
    let handlerReads = 0;
    Object.defineProperty(accessorHandlers, "0", {
      enumerable: true,
      get: () => {
        handlerReads += 1;
        return group.hooks[0];
      },
    });
    expect(() =>
      createHookDeclarationOverrides({
        hooks: {
          ...candidateConfig.hooks,
          PreToolUse: [{ ...group, hooks: accessorHandlers }],
        },
      }),
    ).toThrow("访问器");
    expect(handlerReads).toBe(0);
  });

  it("exact-key validation rejects hidden own fields", () => {
    const hiddenHooks = { ...candidateConfig.hooks };
    Object.defineProperty(hiddenHooks, "hidden", { enumerable: false, value: [] });
    expect(() => createHookDeclarationOverrides({ hooks: hiddenHooks })).toThrow("字段集合");
  });

  it("TOML 内联值确定性输出且 fail closed", () => {
    expect(serializeTomlValue({ z: [true, 2], a: "text" })).toBe('{a="text",z=[true,2]}');
    const sharedValue = { enabled: true };
    expect(serializeTomlValue({ left: sharedValue, right: sharedValue })).toBe(
      "{left={enabled=true},right={enabled=true}}",
    );

    const cycle: Record<string, unknown> = {};
    cycle["self"] = cycle;
    expect(() => serializeTomlValue(cycle)).toThrow("循环");
    expect(() => serializeTomlValue(new Date(0))).toThrow("非 plain object");
    expect(() => serializeTomlValue(Number.NaN)).toThrow("仅支持");
    expect(() => serializeTomlValue(Number.MAX_SAFE_INTEGER + 1)).toThrow("仅支持");
    expect(() => serializeTomlValue(null)).toThrow("仅支持");
    expect(() => serializeTomlValue([,])).toThrow("稀疏");

    let getterReads = 0;
    const getterObject = {};
    Object.defineProperty(getterObject, "secret", {
      enumerable: true,
      get: () => {
        getterReads += 1;
        return "must not read";
      },
    });
    expect(() => serializeTomlValue(getterObject)).toThrow("访问器");
    expect(getterReads).toBe(0);
  });

  it("TOML serializer rejects hidden fields and invalid array keys", () => {
    const hiddenObject = { visible: true };
    Object.defineProperty(hiddenObject, "hidden", { enumerable: false, value: true });
    expect(() => serializeTomlValue(hiddenObject)).toThrow("non-enumerable");

    const invalidArrayKey = [true];
    Object.defineProperty(invalidArrayKey, "4294967295", { enumerable: true, value: true });
    expect(() => serializeTomlValue(invalidArrayKey)).toThrow("非法数组字段");
  });

  it("TOML basic strings encode controls and valid Unicode without lone surrogates", () => {
    const codePoints = [
      ...Array.from({ length: 9 }, (_, index) => index),
      0x09,
      0x0a,
      0x0b,
      0x0c,
      0x0d,
      ...Array.from({ length: 18 }, (_, index) => index + 0x0e),
      0x7f,
    ];
    const expectedEscapes = [
      ...Array.from({ length: 8 }, (_, index) => `\\u000${index}`),
      "\\b",
      "\\t",
      "\\n",
      "\\u000B",
      "\\f",
      "\\r",
      ...Array.from(
        { length: 18 },
        (_, index) => `\\u${(index + 0x0e).toString(16).padStart(4, "0").toUpperCase()}`,
      ),
      "\\u007F",
    ];
    expect(serializeTomlValue(String.fromCharCode(...codePoints))).toBe(
      `"${expectedEscapes.join("")}"`,
    );
    expect(() => serializeTomlValue("\ud800")).toThrow("surrogate");
    expect(() => serializeTomlValue("\udc00")).toThrow("surrogate");
    expect(serializeTomlValue("😀")).toBe('"😀"');
  });
});
