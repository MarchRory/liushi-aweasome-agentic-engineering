import { describe, expect, it } from "vitest";

import {
  collectNonCjkSourceCommentFindings,
  collectUndocumentedExportFindings,
  createSourceGraph,
} from "./support/index.js";

describe("architecture TSDoc coverage", () => {
  it("documents exported classes, functions, interfaces, interface properties, types, enums, and enum members", () => {
    const graph = createSourceGraph();
    const findings = collectUndocumentedExportFindings(graph);

    expect(findings).toEqual([]);
  });

  it("keeps source comments localized with CJK text except minimal tool directives", () => {
    const graph = createSourceGraph();
    const findings = collectNonCjkSourceCommentFindings(graph);

    expect(findings).toEqual([]);
  });
});
