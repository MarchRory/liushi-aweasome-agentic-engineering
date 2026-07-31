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
const platformToken = /\b(?:process\.platform|win32|linux|darwin|freebsd|openbsd|aix|sunos)\b/u;

describe("Codex App Server Preflight 架构边界", () => {
  it("正式实现不依赖 Pilot 或固定公开项目", () => {
    const graph = createSourceGraph();
    const root = resolvePreflightRoot(graph.srcRoot);
    const findings = collectFiles(root).flatMap((fileName) =>
      forbiddenProjectCoupling.test(readFileSync(fileName, "utf8"))
        ? [formatRelative(graph, fileName)]
        : [],
    );

    expect(findings).toEqual([]);
  });

  it("每个职责目录都有 index.ts，且单文件不超过 300 行", () => {
    const graph = createSourceGraph();
    const root = resolvePreflightRoot(graph.srcRoot);
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

  it("操作系统差异只存在于 platform 兼容层", () => {
    const graph = createSourceGraph();
    const root = resolvePreflightRoot(graph.srcRoot);
    const findings = collectFiles(root)
      .filter((fileName) => !fileName.includes(`${path.sep}platform${path.sep}`))
      .flatMap((fileName) =>
        platformToken.test(readFileSync(fileName, "utf8")) ? [formatRelative(graph, fileName)] : [],
      );

    expect(findings).toEqual([]);
  });

  it("Pilot 只通过唯一构建产物桥消费正式实现", () => {
    const graph = createSourceGraph();
    const pilotRoot = path.join(
      graph.harnessRoot,
      "scripts",
      "codexAgentPilot",
      "host",
      "preflight",
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
      'export * from "../../../../dist/infrastructure/executors/codex/agentHost/preflight/index.js";',
    );
    expect(pilotConstants).not.toMatch(/export const CODEX_APP_SERVER_PREFLIGHT_/u);
    expect(agentHostRoot).not.toContain("preflight");
    expect(tsup).toContain("agentHost/preflight/index.ts");
  });

  it("Preflight 不把 Native Hook 结论或临时根写入证据契约", () => {
    const graph = createSourceGraph();
    const root = resolvePreflightRoot(graph.srcRoot);
    const findings = collectFiles(root).flatMap((fileName) => {
      const content = readFileSync(fileName, "utf8");

      return /nativeHook|18607|preservedRoot|temporaryRoot/iu.test(content) &&
        fileName.includes(`${path.sep}evidence${path.sep}`)
        ? [formatRelative(graph, fileName)]
        : [];
    });

    expect(findings).toEqual([]);
  });
});

function resolvePreflightRoot(srcRoot: string): string {
  return path.join(srcRoot, "infrastructure", "executors", "codex", "agentHost", "preflight");
}
