import { describe, expect, it } from "vitest";

import { CliCommand, CliResponseStatus } from "../../../src/presentation/index.js";
import { runCommand, singleOutput, withStore } from "./support/index.js";

describe("CLI doctor 与 help E2E", () => {
  it("doctor --json 返回成功 Envelope，且只写入 stdout", async () => {
    await withStore(async (storeRoot) => {
      const output = await runCommand(["doctor", "--store", storeRoot, "--json"], storeRoot);
      expect(output.exitCode).toBe(0);
      expect(output.stdout).toHaveLength(1);
      expect(output.stderr).toHaveLength(0);
      expect(JSON.parse(singleOutput(output.stdout))).toMatchObject({
        status: CliResponseStatus.Success,
        command: CliCommand.Doctor,
      });
    });
  });

  it("unknown command --json 返回 InvalidInput failure 和退出码 2，且只写入 stderr", async () => {
    await withStore(async (storeRoot) => {
      const output = await runCommand(["unknown-command", "--json"], storeRoot);
      expect(output.exitCode).toBe(2);
      expect(output.stdout).toHaveLength(0);
      expect(output.stderr).toHaveLength(1);
      expect(JSON.parse(singleOutput(output.stderr))).toMatchObject({
        command: CliCommand.Unknown,
        status: CliResponseStatus.Failure,
        error: { code: "invalid_input" },
      });
    });
  });

  it("Human help 输出全部真实命令，且只写入 stdout", async () => {
    await withStore(async (storeRoot) => {
      const output = await runCommand(["help"], storeRoot);
      expect(output.exitCode).toBe(0);
      expect(output.stderr).toHaveLength(0);
      expect(output.stdout).toHaveLength(1);
      expect(singleOutput(output.stdout).split("\n").filter(Boolean)).toEqual([
        expect.stringContaining("doctor"),
        expect.stringContaining("task create"),
        expect.stringContaining("task status"),
        expect.stringContaining("artifact propose"),
        expect.stringContaining("approval decide"),
        expect.stringContaining("rules resolve"),
        expect.stringContaining("project scan"),
        expect.stringContaining("profile compile"),
        expect.stringContaining("hook bind"),
        expect.stringContaining("hook config"),
        expect.stringContaining("hook handle"),
      ]);
    });
  });
});
