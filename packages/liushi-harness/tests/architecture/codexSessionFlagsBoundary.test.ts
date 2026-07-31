import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  collectDirectories,
  collectFiles,
  createSourceGraph,
  formatRelative,
  hasIndexFile,
} from "./support/index.js";

const forbiddenProjectCoupling =
  /\b(?:codexAgentPilot|publicProjectSmoke|fixedProject|unjs|defu)\b/iu;

describe("Codex Session Flags 架构边界", () => {
  it("正式实现不依赖 Pilot 或固定项目", () => {
    const graph = createSourceGraph();
    const root = resolveSessionFlagsRoot(graph.srcRoot);
    const findings = collectFiles(root).flatMap((fileName) =>
      forbiddenProjectCoupling.test(readFileSync(fileName, "utf8"))
        ? [formatRelative(graph, fileName)]
        : [],
    );

    expect(findings).toEqual([]);
  });

  it("每个职责目录都有 index.ts，且单文件不超过 300 行", () => {
    const graph = createSourceGraph();
    const root = resolveSessionFlagsRoot(graph.srcRoot);
    const missingIndexes = collectDirectories(root)
      .concat(root)
      .filter((directory) => !hasIndexFile(directory))
      .map((directory) => formatRelative(graph, directory));
    const oversizedFiles = collectFiles(root)
      .filter((fileName) => fileName.endsWith(".ts"))
      .filter((fileName) => readFileSync(fileName, "utf8").split(/\r?\n/u).length > 300)
      .map((fileName) => formatRelative(graph, fileName));

    expect(missingIndexes).toEqual([]);
    expect(oversizedFiles).toEqual([]);
  });

  it("Pilot 只保留唯一 dist bridge，正式入口不进入 agentHost 根导出", () => {
    const graph = createSourceGraph();
    const pilotRoot = path.join(
      graph.harnessRoot,
      "scripts",
      "codexAgentPilot",
      "host",
      "sessionFlags",
    );
    const bridgeFiles = collectFiles(pilotRoot).map((fileName) =>
      path.relative(pilotRoot, fileName),
    );
    const bridge = readFileSync(path.join(pilotRoot, "index.mjs"), "utf8").trim();
    const pilotConstants = readFileSync(
      path.join(
        graph.harnessRoot,
        "scripts",
        "codexAgentPilot",
        "constants",
        "codexAgentPilotConstants.mjs",
      ),
      "utf8",
    );
    const agentHostRoot = readFileSync(
      path.join(graph.srcRoot, "infrastructure", "executors", "codex", "agentHost", "index.ts"),
      "utf8",
    );
    const tsup = readFileSync(path.join(graph.harnessRoot, "tsup.config.ts"), "utf8");

    expect(bridgeFiles).toEqual(["index.mjs"]);
    expect(bridge).toBe(
      'export * from "../../../../dist/infrastructure/executors/codex/agentHost/sessionFlags/index.js";',
    );
    expect(pilotConstants).not.toMatch(
      /export const CODEX_(?:DISABLED_AGENT_FEATURES|RESTRICTED_RUNTIME_OVERRIDES)/u,
    );
    expect(pilotConstants).toContain("agentHost/sessionFlags/index.js");
    expect(agentHostRoot).not.toContain("sessionFlags");
    expect(tsup).toContain("agentHost/sessionFlags/index.ts");
  });

  it("正式实现不包含危险 bypass flags", () => {
    const graph = createSourceGraph();
    const root = resolveSessionFlagsRoot(graph.srcRoot);
    const forbidden = collectFiles(root).flatMap((fileName) => {
      const content = readFileSync(fileName, "utf8");
      return /dangerously-bypass-(?:approvals-and-sandbox|hook-trust)/u.test(content)
        ? [formatRelative(graph, fileName)]
        : [];
    });

    expect(forbidden).toEqual([]);
  });
});

function resolveSessionFlagsRoot(srcRoot: string): string {
  return path.join(srcRoot, "infrastructure", "executors", "codex", "agentHost", "sessionFlags");
}
