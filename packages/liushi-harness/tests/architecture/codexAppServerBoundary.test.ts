import { readFileSync } from "node:fs";
import path from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { collectFiles, createSourceGraph, formatRelative } from "./support/index.js";

const forbiddenPilotReferences =
  /\b(?:codexAgentPilot|publicProjectSmoke|fixedProject|unjs|defu)\b/iu;
const platformLiteral = /["'](?:win32|linux|darwin|freebsd|openbsd|aix|sunos)["']/u;
const platformTerminationToken = /\b(?:taskkill(?:\.exe)?|SIGTERM|SIGKILL|process\.kill)\b/u;

describe("Codex App Server Runner 架构边界", () => {
  it("正式实现不依赖固定 Pilot 或公开项目 Fixture", () => {
    const graph = createSourceGraph();
    const findings = collectFiles(resolveAppServerRoot(graph.srcRoot)).flatMap((fileName) => {
      const content = readFileSync(fileName, "utf8");

      return forbiddenPilotReferences.test(content) ? [formatRelative(graph, fileName)] : [];
    });

    expect(findings).toEqual([]);
  });

  it("操作系统分支和进程树终止细节只存在于 platform 兼容层", () => {
    const graph = createSourceGraph();
    const findings = collectFiles(resolveAppServerRoot(graph.srcRoot))
      .filter((fileName) => !fileName.includes(`${path.sep}platform${path.sep}`))
      .flatMap((fileName) => {
        const content = readFileSync(fileName, "utf8");

        return platformLiteral.test(content) || platformTerminationToken.test(content)
          ? [formatRelative(graph, fileName)]
          : [];
      });

    expect(findings).toEqual([]);
  });

  it("所有直接子进程启动都禁用 shell 并隐藏 Windows 窗口", () => {
    const graph = createSourceGraph();
    const spawnCalls = collectFiles(resolveAppServerRoot(graph.srcRoot)).flatMap((fileName) => {
      const sourceFile = ts.createSourceFile(
        fileName,
        readFileSync(fileName, "utf8"),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      );

      return collectSpawnCalls(sourceFile).map((call) => ({ fileName, call }));
    });

    expect(spawnCalls.length).toBeGreaterThan(0);
    for (const { fileName, call } of spawnCalls) {
      const options = call.arguments[2];

      expect(
        options !== undefined && ts.isObjectLiteralExpression(options),
        `${formatRelative(graph, fileName)} 的 spawn options 必须是可静态审计的对象字面量`,
      ).toBe(true);
      expect(readBooleanProperty(options, "shell")).toBe(false);
      expect(readBooleanProperty(options, "windowsHide")).toBe(true);
    }
  });

  it("固定 Pilot 只通过唯一构建产物桥消费正式实现", () => {
    const graph = createSourceGraph();
    const bridgeRoot = path.join(
      graph.harnessRoot,
      "scripts",
      "codexAgentPilot",
      "host",
      "agentRunner",
      "appServer",
    );

    expect(collectFiles(bridgeRoot).map((fileName) => path.relative(bridgeRoot, fileName))).toEqual(
      ["index.mjs"],
    );
    expect(readFileSync(path.join(bridgeRoot, "index.mjs"), "utf8").trim()).toBe(
      'export * from "../../../../../dist/infrastructure/executors/codex/agentHost/appServer/index.js";',
    );
  });
});

function resolveAppServerRoot(srcRoot: string): string {
  return path.join(srcRoot, "infrastructure", "executors", "codex", "agentHost", "appServer");
}

function collectSpawnCalls(sourceFile: ts.SourceFile): ts.CallExpression[] {
  const calls: ts.CallExpression[] = [];

  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      (node.expression.text === "spawn" || node.expression.text === "spawnProcess")
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
  const property = options.properties.find(
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
