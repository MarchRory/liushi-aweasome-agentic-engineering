import { describe, expect, it } from "vitest";

import {
  ArchitectureLayer,
  collectForbiddenRuntimeFindings,
  createSourceGraph,
  getLayer,
} from "./support/index.js";

describe("domain and application runtime boundary", () => {
  it("does not depend on node runtime, process, or console", () => {
    const graph = createSourceGraph();
    const findings = collectForbiddenRuntimeFindings(graph, (sourceFile) => {
      const layer = getLayer(graph, sourceFile.fileName);

      return layer === ArchitectureLayer.Domain || layer === ArchitectureLayer.Application;
    }).map((finding) => finding.message);

    expect(findings).toEqual([]);
  });
});
