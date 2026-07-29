import { execFile } from "node:child_process";
import process from "node:process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const packageRoot = resolve(import.meta.dirname, "../../..");
const pilotIndexUrl = pathToFileURL(resolve(packageRoot, "scripts/codexAgentPilot/index.mjs")).href;

describe("Codex Agent Pilot Node 原生入口", () => {
  it("原生 ESM 可加载生产入口且不导出旧进程 Runner", async () => {
    const script = [
      `const pilot = await import(${JSON.stringify(pilotIndexUrl)});`,
      'if (typeof pilot.runCodexAgentPilotAgent !== "function") throw new Error("run-agent missing");',
      'if (typeof pilot.prepareCodexAgentRuntime !== "function") throw new Error("runtime missing");',
      'if ("runCodexAgentProcess" in pilot) throw new Error("legacy runner exported");',
      'process.stdout.write("ok\\n");',
    ].join("\n");

    const result = await execFileAsync(
      process.execPath,
      ["--input-type=module", "--eval", script],
      {
        cwd: packageRoot,
        encoding: "utf8",
        windowsHide: true,
      },
    );

    expect(result.stdout).toBe("ok\n");
    expect(result.stderr).toBe("");
  });
});
