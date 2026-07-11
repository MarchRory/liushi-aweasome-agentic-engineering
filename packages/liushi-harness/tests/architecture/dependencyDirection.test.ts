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
});
