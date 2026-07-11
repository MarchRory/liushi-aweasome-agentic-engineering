import { describe, expect, it } from "vitest";

import { collectUndocumentedExportFindings, createSourceGraph } from "./support/index.js";

describe("architecture TSDoc coverage", () => {
  it("documents exported classes, functions, interfaces, interface properties, types, enums, and enum members", () => {
    const graph = createSourceGraph();
    const findings = collectUndocumentedExportFindings(graph);

    expect(findings).toEqual([]);
  });
});
