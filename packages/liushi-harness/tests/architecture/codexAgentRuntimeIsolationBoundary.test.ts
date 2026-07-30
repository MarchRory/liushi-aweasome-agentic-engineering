import { readFileSync } from "node:fs";
import path from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { collectFiles, createSourceGraph, formatRelative } from "./support/index.js";

const forbiddenPilotReferences =
  /\b(?:codexAgentPilot|publicProjectSmoke|fixedProject|unjs|defu)\b/iu;
const platformLiteral = /["'](?:win32|linux|darwin|freebsd|openbsd|aix|sunos)["']/u;

describe("Codex Agent Runtime Isolation 架构边界", () => {
  it("正式实现不依赖固定 Pilot 或公开项目 Fixture", () => {
    const graph = createSourceGraph();
    const runtimeRoot = path.join(
      graph.srcRoot,
      "infrastructure",
      "executors",
      "codex",
      "agentHost",
      "runtimeIsolation",
    );
    const findings = collectFiles(runtimeRoot).flatMap((fileName) => {
      const content = readFileSync(fileName, "utf8");

      return forbiddenPilotReferences.test(content) ? [formatRelative(graph, fileName)] : [];
    });

    expect(findings).toEqual([]);
  });

  it("操作系统分支只存在于 platform 兼容层", () => {
    const graph = createSourceGraph();
    const runtimeRoot = path.join(
      graph.srcRoot,
      "infrastructure",
      "executors",
      "codex",
      "agentHost",
      "runtimeIsolation",
    );
    const findings = collectFiles(runtimeRoot)
      .filter((fileName) => !fileName.includes(`${path.sep}platform${path.sep}`))
      .flatMap((fileName) => {
        const content = readFileSync(fileName, "utf8");

        return platformLiteral.test(content) ? [formatRelative(graph, fileName)] : [];
      });

    expect(findings).toEqual([]);
  });

  it("Windows 默认进程执行器禁止 shell 并隐藏窗口", () => {
    const graph = createSourceGraph();
    const fileName = path.join(
      graph.srcRoot,
      "infrastructure",
      "executors",
      "codex",
      "agentHost",
      "runtimeIsolation",
      "platform",
      "windowsRuntimeSecurity.ts",
    );
    const sourceFile = ts.createSourceFile(
      fileName,
      readFileSync(fileName, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const spawnSyncCalls = collectSpawnSyncCalls(sourceFile);
    const options = spawnSyncCalls[0]?.arguments[2];

    expect(spawnSyncCalls).toHaveLength(1);
    expect(options !== undefined && ts.isObjectLiteralExpression(options)).toBe(true);
    expect(readBooleanProperty(options, "shell")).toBe(false);
    expect(readBooleanProperty(options, "windowsHide")).toBe(true);
  });

  it("固定 Pilot 只通过唯一构建产物桥消费正式实现", () => {
    const graph = createSourceGraph();
    const bridgeRoot = path.join(
      graph.harnessRoot,
      "scripts",
      "codexAgentPilot",
      "host",
      "agentRunner",
      "runtimeIsolation",
    );

    expect(collectFiles(bridgeRoot).map((fileName) => path.relative(bridgeRoot, fileName))).toEqual(
      ["index.mjs"],
    );
    const bridge = readFileSync(path.join(bridgeRoot, "index.mjs"), "utf8");

    expect(bridge).toContain(
      'export * from "../../../../../dist/infrastructure/executors/codex/agentHost/runtimeIsolation/index.js";',
    );
    expect(bridge).toContain('"liushi.codex-agent-pilot.environment-policy.v1"');
    expect(bridge).toContain('IsolatedAuthCopy: "isolated_auth_copy"');
  });
});

function collectSpawnSyncCalls(sourceFile: ts.SourceFile): ts.CallExpression[] {
  const calls: ts.CallExpression[] = [];

  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "spawnSync"
    ) {
      calls.push(node);
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return calls;
}

function readBooleanProperty(
  options: ts.Expression | undefined,
  propertyName: string,
): boolean | undefined {
  if (options === undefined || !ts.isObjectLiteralExpression(options)) {
    return undefined;
  }
  const property = options?.properties.find(
    (candidate): candidate is ts.PropertyAssignment =>
      ts.isPropertyAssignment(candidate) &&
      ((ts.isIdentifier(candidate.name) && candidate.name.text === propertyName) ||
        (ts.isStringLiteral(candidate.name) && candidate.name.text === propertyName)),
  );

  if (property?.initializer.kind === ts.SyntaxKind.TrueKeyword) {
    return true;
  }
  if (property?.initializer.kind === ts.SyntaxKind.FalseKeyword) {
    return false;
  }

  return undefined;
}
