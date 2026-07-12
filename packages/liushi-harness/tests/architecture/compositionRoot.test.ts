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
      "CodexCapabilityProbeAdapter",
      "CodexHookAdapter",
      "ExclusiveFileLockManager",
      "FileActionJournalRepository",
      "FileCodingTaskRepository",
      "FileCommandReservationStore",
      "FileHookBindingStore",
      "FileParentDirectoryDurability",
      "FileRuntimeHealthAdapter",
      "FileSnapshotStore",
      "FileTaskRepository",
      "FileTraceObservationStore",
      "FileWorkflowRepository",
      "NodeCommandRunnerAdapter",
      "NodeHookInputReaderAdapter",
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

  it("仅由 composition root 装配 Project Profile 编译 Use Case", () => {
    const graph = createSourceGraph();
    const owners = graph.sourceFiles.flatMap((sourceFile) =>
      collectNewExpressionNames(sourceFile)
        .filter((expression) => expression.className === "CompileProjectProfileUseCase")
        .map(() => formatRelative(graph, sourceFile.fileName).replaceAll("\\", "/")),
    );

    expect(owners).toEqual(["src/bootstrap/compositionRoot/compositionRoot.ts"]);
  });
});
