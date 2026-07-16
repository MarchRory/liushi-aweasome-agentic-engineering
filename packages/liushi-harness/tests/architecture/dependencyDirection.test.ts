import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  ArchitectureLayer,
  createSourceGraph,
  formatRelative,
  getLayer,
  isPublicEntryPoint,
  isSamePublicModule,
} from "./support/index.js";

const allowedLayerDependencies: Readonly<
  Record<ArchitectureLayer, ReadonlySet<ArchitectureLayer>>
> = {
  [ArchitectureLayer.Common]: new Set([ArchitectureLayer.Common]),
  [ArchitectureLayer.Domain]: new Set([ArchitectureLayer.Common, ArchitectureLayer.Domain]),
  [ArchitectureLayer.Application]: new Set([
    ArchitectureLayer.Common,
    ArchitectureLayer.Domain,
    ArchitectureLayer.Application,
  ]),
  [ArchitectureLayer.Infrastructure]: new Set([
    ArchitectureLayer.Common,
    ArchitectureLayer.Domain,
    ArchitectureLayer.Application,
    ArchitectureLayer.Infrastructure,
  ]),
  [ArchitectureLayer.Presentation]: new Set([
    ArchitectureLayer.Common,
    ArchitectureLayer.Application,
    ArchitectureLayer.Presentation,
  ]),
  [ArchitectureLayer.Bootstrap]: new Set([
    ArchitectureLayer.Common,
    ArchitectureLayer.Domain,
    ArchitectureLayer.Application,
    ArchitectureLayer.Infrastructure,
    ArchitectureLayer.Presentation,
    ArchitectureLayer.Bootstrap,
  ]),
};

describe("architecture dependency direction", () => {
  it("matches the approved common/domain/application/infrastructure/presentation/bootstrap direction", () => {
    const graph = createSourceGraph();
    const violations = graph.dependencies.flatMap((dependency) => {
      const importerLayer = getLayer(graph, dependency.importer);
      const importedLayer = getLayer(graph, dependency.imported);

      if (!importerLayer || !importedLayer) {
        return [];
      }

      if (allowedLayerDependencies[importerLayer].has(importedLayer)) {
        return [];
      }

      return [
        `${formatRelative(graph, dependency.importer)} imports ${formatRelative(
          graph,
          dependency.imported,
        )} through ${dependency.specifier}`,
      ];
    });

    expect(violations).toEqual([]);
  });

  it("uses index.ts public exports for cross-layer and cross-module imports", () => {
    const graph = createSourceGraph();
    const violations = graph.dependencies.flatMap((dependency) => {
      if (isSamePublicModule(graph, dependency.importer, dependency.imported)) {
        return [];
      }

      if (isPublicEntryPoint(dependency.imported)) {
        return [];
      }

      return [
        `${formatRelative(graph, dependency.importer)} imports internal file ${formatRelative(
          graph,
          dependency.imported,
        )} through ${dependency.specifier}`,
      ];
    });

    expect(violations).toEqual([]);
  });

  it("requires private layer aliases for cross-layer imports", () => {
    const graph = createSourceGraph();
    const violations = graph.dependencies.flatMap((dependency) => {
      const importerLayer = getLayer(graph, dependency.importer);
      const importedLayer = getLayer(graph, dependency.imported);

      if (!importerLayer || !importedLayer || importerLayer === importedLayer) {
        return [];
      }

      const targetModule = path
        .relative(graph.srcRoot, path.dirname(dependency.imported))
        .split(path.sep)
        .join("/");

      return dependency.specifier === `#${targetModule}/index.js`
        ? []
        : [
            `${formatRelative(graph, dependency.importer)} crosses ${importerLayer} to ${formatRelative(
              graph,
              dependency.imported,
            )} through ${dependency.specifier}; use #${targetModule}/index.js`,
          ];
    });

    expect(violations).toEqual([]);
  });

  it("rejects source-relative imports with four or more parent traversals", () => {
    const graph = createSourceGraph();
    const violations = graph.dependencies
      .filter(({ specifier }) => /^(?:\.\.\/){4}/.test(specifier))
      .map(
        (dependency) =>
          `${formatRelative(graph, dependency.importer)} uses deep relative import ${dependency.specifier}`,
      );

    expect(violations).toEqual([]);
  });

  it("Executor Compatibility Query 仅依赖执行器无关的 Projection Set Verifier Port", () => {
    const graph = createSourceGraph();
    const querySource = graph.sourceFiles.find(
      (sourceFile) =>
        formatRelative(graph, sourceFile.fileName).replaceAll("\\", "/") ===
        "src/application/useCases/queryExecutorCompatibility/queryExecutorCompatibility.useCase.ts",
    );
    if (querySource === undefined) throw new Error("Executor Compatibility Query 源码缺失。");

    expect(querySource.getText()).toContain(
      "ExecutorCompatibilityEvidenceProjectionSetVerifierPort",
    );
    expect(querySource.getText()).not.toContain("CodexCompatibilityEvidenceProjectorPort");
  });

  it("Application 不反向依赖 Infrastructure", () => {
    const graph = createSourceGraph();
    const violations = graph.dependencies
      .filter(
        (dependency) => getLayer(graph, dependency.importer) === ArchitectureLayer.Application,
      )
      .filter(
        (dependency) => getLayer(graph, dependency.imported) === ArchitectureLayer.Infrastructure,
      )
      .map(
        (dependency) =>
          `${formatRelative(graph, dependency.importer)} imports ${formatRelative(
            graph,
            dependency.imported,
          )}`,
      );

    expect(violations).toEqual([]);
  });

  it("通用 Projection Verifier 不依赖 Bootstrap 或 Presentation", () => {
    const graph = createSourceGraph();
    const modulePrefix = "src/infrastructure/executorCompatibilityProjectionVerifier/";
    const verifierFiles = graph.sourceFiles.filter((sourceFile) =>
      formatRelative(graph, sourceFile.fileName).replaceAll("\\", "/").startsWith(modulePrefix),
    );
    const violations = graph.dependencies
      .filter((dependency) => verifierFiles.some((file) => file.fileName === dependency.importer))
      .filter((dependency) => {
        const layer = getLayer(graph, dependency.imported);
        return layer === ArchitectureLayer.Bootstrap || layer === ArchitectureLayer.Presentation;
      })
      .map(
        (dependency) =>
          `${formatRelative(graph, dependency.importer)} imports ${formatRelative(
            graph,
            dependency.imported,
          )}`,
      );

    expect(verifierFiles.length).toBeGreaterThan(0);
    expect(violations).toEqual([]);
  });

  it("生产 Hook Input Reader 位于 Infrastructure 且不反向依赖 Presentation", () => {
    const graph = createSourceGraph();
    const readerPath = "src/infrastructure/hookInputReader/adapter/nodeHookInputReader.adapter.ts";
    const reader = graph.sourceFiles.find(
      (sourceFile) =>
        formatRelative(graph, sourceFile.fileName).replaceAll("\\", "/") === readerPath,
    );
    if (reader === undefined) throw new Error("Infrastructure Hook Input Reader 源码缺失。");

    const presentationDependencies = graph.dependencies
      .filter((dependency) => dependency.importer === reader.fileName)
      .filter(
        (dependency) => getLayer(graph, dependency.imported) === ArchitectureLayer.Presentation,
      );
    const legacyReader = graph.sourceFiles.find(
      (sourceFile) =>
        formatRelative(graph, sourceFile.fileName).replaceAll("\\", "/") ===
        "src/presentation/cli/input/adapter/nodeHookInputReader.adapter.ts",
    );

    expect(presentationDependencies).toEqual([]);
    expect(legacyReader).toBeUndefined();
  });
});
