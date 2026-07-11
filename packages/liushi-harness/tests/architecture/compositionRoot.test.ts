import { describe, expect, it } from "vitest";

import {
  ArchitectureLayer,
  collectExportedConcreteAdapterClassNames,
  collectNewExpressionNames,
  createSourceGraph,
  formatRelative,
  getLayer,
} from "./support/index.js";

describe("composition root", () => {
  it("constructs concrete adapters only from bootstrap", () => {
    const graph = createSourceGraph();
    const concreteAdapterClassNames = collectExportedConcreteAdapterClassNames(graph);
    const violations = graph.sourceFiles.flatMap((sourceFile) => {
      if (getLayer(graph, sourceFile.fileName) === ArchitectureLayer.Bootstrap) {
        return [];
      }

      return collectNewExpressionNames(sourceFile)
        .filter((expression) => concreteAdapterClassNames.has(expression.className))
        .map(
          (expression) =>
            `${formatRelative(graph, sourceFile.fileName)} constructs ${expression.className} at ${expression.location}`,
        );
    });

    expect([...concreteAdapterClassNames].sort()).toEqual([
      "ExclusiveFileLockManager",
      "FileParentDirectoryDurability",
      "FileRuntimeHealthAdapter",
      "FileSnapshotStore",
      "FileTaskRepository",
      "NodeJsonDocumentReaderAdapter",
      "NodeProjectFileSystemAdapter",
      "Rfc8785Sha256DigestAdapter",
      "StructuredProjectConfigParserAdapter",
      "SystemClock",
      "SystemDelayAdapter",
      "UlidGenerator",
    ]);
    expect(violations).toEqual([]);
  });
});
