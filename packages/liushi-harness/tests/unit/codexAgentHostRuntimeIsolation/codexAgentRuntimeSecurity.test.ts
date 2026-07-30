import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  assertNoExternalAgentSkills,
  parseWindowsUserSid,
  secureWindowsRuntimeDirectory,
  type RuntimeProcessRunner,
} from "../../../src/infrastructure/executors/codex/agentHost/runtimeIsolation/index.js";
import {
  cleanupRuntimeTestRoots,
  createRuntimeTestRoot,
} from "./codexAgentRuntimeIsolation.fixtures.js";

afterEach(cleanupRuntimeTestRoots);

describe("Codex Agent Runtime 外部配置与平台安全", () => {
  it("拒绝外部 Skill、项目配置和 MCP，但允许普通 AGENTS.md", async () => {
    const root = await createRuntimeTestRoot("external-security");
    const hostHome = join(root, "host-home");
    const worktreeRoot = join(root, "worktree");
    const hostSkills = join(hostHome, ".agents", "skills");
    const worktreeSkills = join(worktreeRoot, ".codex", "skills");
    await mkdir(join(hostSkills, "nested"), { recursive: true });
    await mkdir(join(worktreeSkills, "nested"), { recursive: true });
    await writeFile(join(hostSkills, "AGENTS.md"), "allowed\n", "utf8");
    await writeFile(join(worktreeRoot, "AGENTS.md"), "allowed\n", "utf8");
    await expect(assertNoExternalAgentSkills({ hostHome, worktreeRoot })).resolves.toBeUndefined();

    await writeFile(join(hostSkills, "nested", "SKILL.md"), "host skill\n", "utf8");
    await expect(assertNoExternalAgentSkills({ hostHome, worktreeRoot })).rejects.toThrow(
      "SKILL.md",
    );
    await rm(join(hostSkills, "nested", "SKILL.md"));

    await writeFile(join(worktreeSkills, "nested", "SKILL.md"), "worktree skill\n", "utf8");
    await expect(assertNoExternalAgentSkills({ hostHome, worktreeRoot })).rejects.toThrow(
      "SKILL.md",
    );
    await rm(join(worktreeSkills, "nested", "SKILL.md"));

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

  it("通过 runner 获取唯一 SID 并设置精确 Windows ACL 参数", async () => {
    const runProcess = vi.fn<RuntimeProcessRunner>((command) => {
      if (command === "whoami.exe") {
        return {
          stdout: '"USER","S-1-5-21-111-222-333-1001"\r\n',
          exitCode: 0,
        };
      }
      return { stdout: "", exitCode: 0 };
    });

    await expect(secureWindowsRuntimeDirectory("C:\\runtime", { runProcess })).resolves.toEqual({
      sid: "S-1-5-21-111-222-333-1001",
    });
    expect(parseWindowsUserSid('"USER","S-1-5-21-1-2-3-4"')).toBe("S-1-5-21-1-2-3-4");
    expect(runProcess).toHaveBeenNthCalledWith(2, "icacls.exe", [
      "C:\\runtime",
      "/inheritance:r",
      "/grant:r",
      "*S-1-5-21-111-222-333-1001:(OI)(CI)F",
      "SYSTEM:(OI)(CI)F",
      "/T",
    ]);
    expect(() =>
      parseWindowsUserSid('"USER","S-1-5-21-1-2-3-4"\n"OTHER","S-1-5-21-5-6-7-8"'),
    ).toThrow("不唯一");
  });

  it("injected runner 返回非零退出码时不会静默继续", async () => {
    const runProcess = vi.fn<RuntimeProcessRunner>((command) => {
      if (command === "whoami.exe") {
        return { stdout: '"USER","S-1-5-21-1-2-3-1001"', exitCode: 0 };
      }
      return { stdout: "", stderr: "denied", exitCode: 5 };
    });

    await expect(secureWindowsRuntimeDirectory("C:\\runtime", { runProcess })).rejects.toThrow(
      "退出码 5",
    );
    expect(runProcess).toHaveBeenCalledTimes(2);
  });
});
