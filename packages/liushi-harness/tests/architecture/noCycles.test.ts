import { describe, expect, it } from "vitest";

import { createSourceGraph, findCycles, formatRelative } from "./support/index.js";

describe("architecture dependency graph", () => {
  it("has no cycles inside src", () => {
    const graph = createSourceGraph();
    const cycles = findCycles(graph).map((cycle) =>
      cycle.map((fileName) => formatRelative(graph, fileName)).join(" -> "),
    );

    expect(cycles).toEqual([]);
  });
});
