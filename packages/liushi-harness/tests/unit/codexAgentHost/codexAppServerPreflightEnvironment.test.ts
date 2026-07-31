import { describe, expect, it } from "vitest";

import {
  CODEX_PREFLIGHT_LOOPBACK_NO_PROXY,
  createCodexAppServerPreflightEnvironment,
} from "../../../src/infrastructure/executors/codex/agentHost/preflight/index.js";

describe("Codex App Server Preflight 环境白名单", () => {
  it("只复制白名单，隔离 homes，清空代理并强制 loopback NO_PROXY", () => {
    const environment = createCodexAppServerPreflightEnvironment({
      sourceEnvironment: {
        PATH: "C:\\minimal-bin",
        OPENAI_API_KEY: "secret",
        HTTP_PROXY: "http://proxy.invalid",
        HTTPS_PROXY: "http://proxy.invalid",
        NO_PROXY: "evil.example",
      },
      codexHome: "C:\\isolated\\codex",
      sqliteHome: "C:\\isolated\\codex\\sqlite",
      profileHome: "C:\\isolated\\profile",
      tempHome: "C:\\isolated\\temp",
    });

    expect(environment["PATH"]).toBe("C:\\minimal-bin");
    expect(environment).not.toHaveProperty("OPENAI_API_KEY");
    expect(environment["HTTP_PROXY"]).toBe("");
    expect(environment["HTTPS_PROXY"]).toBe("");
    expect(environment["ALL_PROXY"]).toBe("");
    expect(environment["NO_PROXY"]).toBe(CODEX_PREFLIGHT_LOOPBACK_NO_PROXY);
    expect(environment["no_proxy"]).toBe(CODEX_PREFLIGHT_LOOPBACK_NO_PROXY);
    expect(environment["CODEX_HOME"]).toBe("C:\\isolated\\codex");
    expect(environment["CODEX_SQLITE_HOME"]).toBe("C:\\isolated\\codex\\sqlite");
    expect(environment["HOME"]).toBe("C:\\isolated\\profile");
    expect(environment["USERPROFILE"]).toBe("C:\\isolated\\profile");
    expect(environment["TEMP"]).toBe("C:\\isolated\\temp");
    expect(Object.keys(environment).sort()).toEqual(
      [
        "ALL_PROXY",
        "CODEX_HOME",
        "CODEX_SQLITE_HOME",
        "HOME",
        "HOMEDRIVE",
        "HOMEPATH",
        "HTTP_PROXY",
        "HTTPS_PROXY",
        "NO_PROXY",
        "NO_UPDATE_NOTIFIER",
        "PATH",
        "TEMP",
        "TMP",
        "TMPDIR",
        "USERPROFILE",
        "all_proxy",
        "http_proxy",
        "https_proxy",
        "no_proxy",
      ].sort(),
    );
  });

  it("拒绝输入和源环境中的 getter、Symbol、错误路径及未知字段", () => {
    const sourceEnvironment = { PATH: "C:\\minimal-bin" } as Record<string, string>;
    Object.defineProperty(sourceEnvironment, "SystemRoot", { get: () => "C:\\Windows" });
    expect(() =>
      createCodexAppServerPreflightEnvironment({
        sourceEnvironment,
        codexHome: "C:\\codex",
        sqliteHome: "C:\\sqlite",
        profileHome: "C:\\profile",
        tempHome: "C:\\temp",
      }),
    ).toThrow();

    const symbolInput = {
      codexHome: "C:\\codex",
      sqliteHome: "C:\\sqlite",
      profileHome: "C:\\profile",
      tempHome: "C:\\temp",
    } as Record<string | symbol, unknown>;
    symbolInput[Symbol("extra")] = true;
    expect(() => createCodexAppServerPreflightEnvironment(symbolInput as never)).toThrow();
    expect(() =>
      createCodexAppServerPreflightEnvironment({
        codexHome: "relative",
        sqliteHome: "C:\\sqlite",
        profileHome: "C:\\profile",
        tempHome: "C:\\temp",
      }),
    ).toThrow();
    expect(() =>
      createCodexAppServerPreflightEnvironment({
        codexHome: "C:\\codex",
        sqliteHome: "C:\\sqlite\0bad",
        profileHome: "C:\\profile",
        tempHome: "C:\\temp",
        unexpected: "field",
      } as never),
    ).toThrow();
  });

  it("省略 sourceEnvironment 时仍能从默认进程环境构造白名单", () => {
    expect(() =>
      createCodexAppServerPreflightEnvironment({
        codexHome: "C:\\codex",
        sqliteHome: "C:\\sqlite",
        profileHome: "C:\\profile",
        tempHome: "C:\\temp",
      }),
    ).not.toThrow();
  });
});
