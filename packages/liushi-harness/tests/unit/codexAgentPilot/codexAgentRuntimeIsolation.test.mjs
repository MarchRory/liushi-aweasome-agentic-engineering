import { lstat, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  assertNoExternalAgentSkills,
  assertCodexAgentAuthSourceStable,
  createCodexAgentEnvironment,
  createCodexAgentRuntimePlan,
  parseWindowsUserSid,
  prepareCodexAgentRuntime,
  removeCodexAgentRuntime,
  secureWindowsRuntimeDirectory,
} from "../../../scripts/codexAgentPilot/host/agentRunner/runtimeIsolation/index.mjs";

const SOURCE_STATE_DIGEST = `sha256:${"a".repeat(64)}`;
const AUTH_CONTENT = "opaque-auth-content-that-must-not-be-printed\n";
let temporaryRoots = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
  temporaryRoots = [];
});

describe("Codex Agent Runtime isolation", () => {
  it("确定路径并拒绝空值、路径穿越和非 sha256 摘要", async () => {
    const sourceRoot = await createSourceRoot();
    const source = join(sourceRoot, "codex-home");
    const plan = createCodexAgentRuntimePlan({
      codexHomeSource: source,
      taskId: "01ARZ3NDEKTSV4RRFFQ69G5FCX",
      sourceStateDigest: SOURCE_STATE_DIGEST,
    });

    expect(plan).toMatchObject({
      root: join(sourceRoot, ".liushiHarnessRuntime", "01ARZ3NDEKTSV4RRFFQ69G5FCX", "a".repeat(64)),
      codexHome: join(plan.root, "codexHome"),
      sqliteHome: join(plan.root, "sqliteHome"),
      tempHome: join(plan.root, "tempHome"),
      profileHome: join(plan.root, "profileHome"),
      authSourceFile: join(source, "auth.json"),
      authFile: join(plan.root, "codexHome", "auth.json"),
      credentialStrategy: "isolated_auth_copy",
    });
    expect(
      createCodexAgentRuntimePlan({
        codexHomeSource: source,
        taskId: "01ARZ3NDEKTSV4RRFFQ69G5FCX",
        sourceStateDigest: SOURCE_STATE_DIGEST,
      }),
    ).toEqual(plan);

    for (const input of [
      {},
      { codexHomeSource: source, taskId: "../escape", sourceStateDigest: SOURCE_STATE_DIGEST },
      { codexHomeSource: source, taskId: "safe", sourceStateDigest: "sha512:bad" },
      { codexHomeSource: source, taskId: "safe", sourceStateDigest: "sha256:short" },
    ]) {
      expect(() => createCodexAgentRuntimePlan(input)).toThrow();
    }
  });

  it("只继承白名单环境并覆盖全部 Runtime 路径变量", async () => {
    const plan = createCodexAgentRuntimePlan({
      codexHomeSource: join(await createSourceRoot(), "codex-home"),
      taskId: "safe-task",
      sourceStateDigest: SOURCE_STATE_DIGEST,
    });
    const environment = createCodexAgentEnvironment(
      {
        PATH: "path-value",
        Path: "Path-value",
        SystemRoot: "system-root",
        PROCESSOR_ARCHITECTURE: "AMD64",
        HTTPS_PROXY: "https://proxy.invalid",
        NODE_EXTRA_CA_CERTS: "ca.pem",
        OPENAI_API_KEY: "must-not-inherit",
        CODEX_HOME: "must-not-inherit",
        AWS_ACCESS_KEY_ID: "must-not-inherit",
        RANDOM_SECRET: "must-not-inherit",
      },
      plan,
    );

    expect(environment).toMatchObject({
      PATH: "path-value",
      Path: "Path-value",
      SystemRoot: "system-root",
      PROCESSOR_ARCHITECTURE: "AMD64",
      HTTPS_PROXY: "https://proxy.invalid",
      NODE_EXTRA_CA_CERTS: "ca.pem",
      CODEX_HOME: plan.codexHome,
      CODEX_SQLITE_HOME: plan.sqliteHome,
      TEMP: plan.tempHome,
      TMP: plan.tempHome,
      TMPDIR: plan.tempHome,
      HOME: plan.profileHome,
      USERPROFILE: plan.profileHome,
      HOMEDRIVE: "C:",
      HOMEPATH: plan.profileHome.slice(2),
      NO_UPDATE_NOTIFIER: "1",
    });
    expect(environment).not.toHaveProperty("OPENAI_API_KEY");
    expect(environment).not.toHaveProperty("AWS_ACCESS_KEY_ID");
    expect(environment).not.toHaveProperty("RANDOM_SECRET");
  });

  it("用独立副本准备 Runtime，且 Runtime 写入不影响宿主 auth", async () => {
    const { plan, source } = await createFixture();
    const forbiddenCredentialRead = vi.fn(() => {
      throw new Error("Harness must not read credential content");
    });
    const result = await prepareCodexAgentRuntime(plan, {
      sourceEnv: { PATH: "path-value", OPENAI_API_KEY: "secret" },
      platform: "linux",
      readFile: forbiddenCredentialRead,
    });
    const [sourceMetadata, destinationMetadata] = await Promise.all([
      stat(join(source, "auth.json")),
      stat(plan.authFile),
    ]);

    expect(result.plan).toEqual(plan);
    expect(destinationMetadata.ino).not.toBe(sourceMetadata.ino);
    expect(await readFile(plan.authFile, "utf8")).toBe(AUTH_CONTENT);
    expect(result.env).not.toHaveProperty("OPENAI_API_KEY");
    expect(result.env.CODEX_HOME).toBe(plan.codexHome);
    expect(forbiddenCredentialRead).not.toHaveBeenCalled();

    await writeFile(plan.authFile, "runtime-only-change\n", "utf8");
    expect(await readFile(join(source, "auth.json"), "utf8")).toBe(AUTH_CONTENT);
    await expect(
      assertCodexAgentAuthSourceStable(plan, result.credentialSourceSnapshot),
    ).resolves.toEqual({ verified: true });

    await writeFile(join(source, "auth.json"), "host-drift\n", "utf8");
    await expect(
      assertCodexAgentAuthSourceStable(plan, result.credentialSourceSnapshot),
    ).rejects.toThrow("准备阶段快照不一致");
  });

  it("prepare 任一步失败时只清理本次 Runtime root", async () => {
    const { plan } = await createFixture();
    const runProcess = vi.fn(() => {
      throw new Error("security adapter failure");
    });

    await expect(prepareCodexAgentRuntime(plan, { platform: "win32", runProcess })).rejects.toThrow(
      "security adapter failure",
    );
    await expect(lstat(plan.root)).rejects.toMatchObject({ code: "ENOENT" });
    expect(runProcess).toHaveBeenCalledWith("whoami.exe", ["/user", "/fo", "csv", "/nh"]);
  });

  it("安全清理 Runtime，允许普通文件但拒绝符号链接和伪造 root", async () => {
    const { plan } = await createFixture();
    await prepareCodexAgentRuntime(plan, { platform: "linux" });
    await writeFile(join(plan.root, "ordinary-hard-link.txt"), "hard-link\n", "utf8");
    await expect(removeCodexAgentRuntime(plan)).resolves.toMatchObject({ removed: true });
    await expect(lstat(plan.root)).rejects.toMatchObject({ code: "ENOENT" });

    const second = await createFixture();
    const forged = { ...second.plan, root: join(dirname(second.plan.root), "other-root") };
    await expect(removeCodexAgentRuntime(forged)).rejects.toThrow();

    const third = await createFixture();
    await mkdir(dirname(third.plan.root), { recursive: true });
    await symlink(third.sourceRoot, third.plan.root, "junction").catch(async () => {
      await symlink(third.sourceRoot, third.plan.root);
    });
    await expect(removeCodexAgentRuntime(third.plan)).rejects.toThrow();
  });

  it("外部 skills、project config 和 MCP 存在时 fail closed，但允许普通 AGENTS.md", async () => {
    const root = await createRoot("external-agent-security");
    const hostHome = join(root, "host-home");
    const worktreeRoot = join(root, "worktree");
    await mkdir(join(hostHome, ".agents", "skills", "nested"), { recursive: true });
    await mkdir(join(worktreeRoot, ".codex", "skills"), { recursive: true });
    await writeFile(join(hostHome, ".agents", "skills", "AGENTS.md"), "allowed\n", "utf8");
    await writeFile(join(worktreeRoot, "AGENTS.md"), "allowed\n", "utf8");
    await expect(assertNoExternalAgentSkills({ hostHome, worktreeRoot })).resolves.toBeUndefined();

    await writeFile(join(hostHome, ".agents", "skills", "nested", "SKILL.md"), "skill\n", "utf8");
    await expect(assertNoExternalAgentSkills({ hostHome, worktreeRoot })).rejects.toThrow(
      "SKILL.md",
    );

    await rm(join(hostHome, ".agents", "skills", "nested", "SKILL.md"));
    await writeFile(join(worktreeRoot, ".codex", "config.toml"), "config\n", "utf8");
    await expect(assertNoExternalAgentSkills({ hostHome, worktreeRoot })).rejects.toThrow(
      "config.toml",
    );

    await rm(join(worktreeRoot, ".codex", "config.toml"));
    await writeFile(join(worktreeRoot, ".mcp.json"), "{}\n", "utf8");
    await expect(assertNoExternalAgentSkills({ hostHome, worktreeRoot })).rejects.toThrow(
      ".mcp.json",
    );
  });

  it("Windows adapter 只通过注入 runner 获取 SID 并设置精确 ACL 参数", async () => {
    const runProcess = vi.fn((command) => {
      if (command === "whoami.exe") return { stdout: '"USER","S-1-5-21-111-222-333-1001"\r\n' };
      return { stdout: "" };
    });

    await expect(secureWindowsRuntimeDirectory("C:\\runtime", { runProcess })).resolves.toEqual({
      sid: "S-1-5-21-111-222-333-1001",
    });
    expect(parseWindowsUserSid('"USER","S-1-5-21-1-2-3-4"')).toBe("S-1-5-21-1-2-3-4");
    expect(runProcess).toHaveBeenNthCalledWith(
      2,
      "icacls.exe",
      expect.arrayContaining([
        "C:\\runtime",
        "/inheritance:r",
        "/grant:r",
        "S-1-5-21-111-222-333-1001:(OI)(CI)F",
        "SYSTEM:(OI)(CI)F",
        "/T",
      ]),
    );
    expect(() =>
      parseWindowsUserSid('"USER","S-1-5-21-1-2-3-4"\n"OTHER","S-1-5-21-5-6-7-8"'),
    ).toThrow();
  });
});

async function createFixture() {
  const sourceRoot = await createRoot("runtime-fixture");
  const source = join(sourceRoot, "codex-home");
  await mkdir(source, { recursive: true });
  await writeFile(join(source, "config.toml"), "config\n", "utf8");
  await writeFile(join(source, "auth.json"), AUTH_CONTENT, { encoding: "utf8", mode: 0o600 });
  return {
    sourceRoot,
    source,
    plan: createCodexAgentRuntimePlan({
      codexHomeSource: source,
      taskId: "safe-task",
      sourceStateDigest: SOURCE_STATE_DIGEST,
    }),
  };
}

async function createSourceRoot() {
  const root = await createRoot("plan-fixture");
  await mkdir(join(root, "codex-home"), { recursive: true });
  return root;
}

async function createRoot(prefix) {
  const root = await mkdtemp(join(tmpdir(), `liushi-${prefix}-`));
  temporaryRoots.push(root);
  return root;
}
