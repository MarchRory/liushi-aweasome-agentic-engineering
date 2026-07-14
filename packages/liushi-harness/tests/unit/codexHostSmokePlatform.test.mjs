import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

import { afterEach, describe, expect, it } from "vitest";

import { runProcess } from "../../scripts/common/process/index.mjs";
import {
  createCodexHostHookCommands,
  createPosixShellCommand,
  createWindowsPowerShellCommand,
} from "../../scripts/codexHostSmoke/platform/index.mjs";

const temporaryRoots = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("Codex Host Smoke 平台命令兼容层", () => {
  it("按目标 Shell 的字面量规则序列化参数", () => {
    const arguments_ = ["node executable", "owner's hook.mjs", "$store", "`tick"];

    expect(createPosixShellCommand(arguments_)).toBe(
      "'node executable' 'owner'\"'\"'s hook.mjs' '$store' '`tick'",
    );
    expect(createWindowsPowerShellCommand(arguments_)).toBe(
      "& 'node executable' 'owner''s hook.mjs' '$store' '`tick'",
    );
  });

  it.each(["", "node\0.exe"])("关闭式拒绝非法命令参数 %#", (argument) => {
    expect(() => createPosixShellCommand([argument])).toThrow("非空无 NUL");
    expect(() => createWindowsPowerShellCommand([argument])).toThrow("非空无 NUL");
  });

  it.runIf(process.platform === "win32")(
    "通过 Codex 等价 PowerShell argv 执行并完整转发 stdin",
    async () => {
      const root = await mkdtemp(join(tmpdir(), "liushi codex hook command "));
      temporaryRoots.push(root);
      const fixtureRoot = join(root, "owner's $hook `literal");
      await mkdir(fixtureRoot);
      const cliEntrypoint = join(fixtureRoot, "hook input fixture.mjs");
      const storeRoot = join(fixtureRoot, "runtime store's $value `tick");
      const input = "第一行\r\n第二行\n$stdin 'quote' `tick`\0末尾";
      await writeFile(
        cliEntrypoint,
        [
          "const chunks = [];",
          "for await (const chunk of process.stdin) chunks.push(chunk);",
          "process.stdout.write(JSON.stringify({",
          "  arguments: process.argv.slice(2),",
          '  input: Buffer.concat(chunks).toString("utf8"),',
          "}));",
        ].join("\n"),
        "utf8",
      );
      const commands = createCodexHostHookCommands({
        nodeExecutable: process.execPath,
        cliEntrypoint,
        storeRoot,
      });
      const powershellExecutable = join(
        process.env.SystemRoot ?? "C:\\Windows",
        "System32",
        "WindowsPowerShell",
        "v1.0",
        "powershell.exe",
      );

      const result = runProcess(
        powershellExecutable,
        ["-NoProfile", "-Command", commands.commandWindows],
        { input, timeout: 30_000 },
      );

      expect(JSON.parse(result.stdout)).toEqual({
        arguments: ["hook", "handle", "--executor", "codex", "--store", storeRoot],
        input,
      });
    },
  );

  it.runIf(process.platform === "win32")(
    "把命令注入载荷作为单个字面量参数传递且不产生副作用",
    async () => {
      const root = await mkdtemp(join(tmpdir(), "liushi codex hook injection "));
      temporaryRoots.push(root);
      const fixtureRoot = join(root, "owner's hook");
      await mkdir(fixtureRoot);
      const cliEntrypoint = join(fixtureRoot, "hook argument fixture.mjs");
      const injectionMarker = join(root, "command-injected.txt");
      const storeRoot = `${join(fixtureRoot, "runtime $store")}'; $(Set-Content -LiteralPath '${injectionMarker}' -Value 'injected'); #`;
      await writeFile(
        cliEntrypoint,
        "process.stdout.write(JSON.stringify(process.argv.slice(2)));",
        "utf8",
      );
      const commands = createCodexHostHookCommands({
        nodeExecutable: process.execPath,
        cliEntrypoint,
        storeRoot,
      });
      const powershellExecutable = join(
        process.env.SystemRoot ?? "C:\\Windows",
        "System32",
        "WindowsPowerShell",
        "v1.0",
        "powershell.exe",
      );

      const result = runProcess(
        powershellExecutable,
        ["-NoProfile", "-Command", commands.commandWindows],
        { timeout: 30_000 },
      );

      expect(JSON.parse(result.stdout)).toEqual([
        "hook",
        "handle",
        "--executor",
        "codex",
        "--store",
        storeRoot,
      ]);
      await expect(access(injectionMarker)).rejects.toMatchObject({ code: "ENOENT" });
    },
  );
});
