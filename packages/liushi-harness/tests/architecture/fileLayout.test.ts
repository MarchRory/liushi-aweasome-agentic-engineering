import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  collectDirectories,
  collectFiles,
  createSourceGraph,
  formatRelative,
  hasIndexFile,
  hasTypescriptDescendants,
  readDirectoryEntries,
  statFile,
} from "./support/index.js";

const packageRootEntries = new Set([
  "CHANGELOG.md",
  "LICENSE",
  "README.md",
  "THIRD_PARTY_NOTICES.md",
  "dist",
  "docs",
  "node_modules",
  "package.json",
  "src",
  "tests",
  "thirdPartyLicenses",
  "tsconfig.json",
  "tsup.config.ts",
]);

const MAX_SOURCE_FILE_LINES = 300;

describe("architecture file layout", () => {
  it("keeps package root entries on the approved whitelist", () => {
    const graph = createSourceGraph();
    const unexpectedEntries = readDirectoryEntries(graph.harnessRoot)
      .map((entryPath) => path.basename(entryPath))
      .filter((entryName) => !packageRootEntries.has(entryName));

    expect(unexpectedEntries).toEqual([]);
  });

  it("uses lower camelCase file and directory names without hyphens", () => {
    const graph = createSourceGraph();
    const checkedRoots = [graph.srcRoot, path.join(graph.harnessRoot, "tests")];
    const violations = checkedRoots.flatMap((root) => [
      ...collectDirectories(root).flatMap((directory) => {
        const name = path.basename(directory);

        return isLowerCamelName(name)
          ? []
          : [`${formatRelative(graph, directory)} directory is not lower camelCase`];
      }),
      ...collectFiles(root).flatMap((fileName) => {
        const name = path.basename(fileName);

        return isAllowedSourceFileName(name)
          ? []
          : [`${formatRelative(graph, fileName)} file is not lower camelCase`];
      }),
    ]);

    expect(violations).toEqual([]);
  });

  it("accepts only ASCII lower camelCase path segments", () => {
    expect(["lowerCamel", "lowercase", "a1"].every(isLowerCamelName)).toBe(true);
    expect(
      ["snake_case", "two words", "1leading", "UpperCamel", "kebab-case", ""].filter(
        isLowerCamelName,
      ),
    ).toEqual([]);
  });

  it("requires index.ts for every source directory containing TypeScript descendants", () => {
    const graph = createSourceGraph();
    const violations = collectDirectories(graph.srcRoot)
      .filter((directory) => hasTypescriptDescendants(directory))
      .filter((directory) => !hasIndexFile(directory))
      .map((directory) => `${formatRelative(graph, directory)} is missing index.ts`);

    expect(violations).toEqual([]);
  });

  it("keeps direct source file counts and nesting depth within budget", () => {
    const graph = createSourceGraph();
    const sourceFileCountViolations = collectDirectories(graph.srcRoot).flatMap((directory) => {
      const directSourceFileCount = readDirectoryEntries(directory).filter(
        (entryPath) => statFile(entryPath).isFile() && entryPath.endsWith(".ts"),
      ).length;

      return directSourceFileCount <= 10
        ? []
        : [`${formatRelative(graph, directory)} has ${directSourceFileCount} direct source files`];
    });
    const nestingViolations = collectFiles(graph.srcRoot).flatMap((fileName) => {
      const relativePath = path.relative(graph.srcRoot, fileName);
      const depth = relativePath.length === 0 ? 0 : relativePath.split(path.sep).length;

      return depth <= 7
        ? []
        : [`${formatRelative(graph, fileName)} has src nesting depth ${depth}`];
    });

    expect([...sourceFileCountViolations, ...nestingViolations]).toEqual([]);
  });

  it("keeps each source file within the reviewable line budget", () => {
    const graph = createSourceGraph();
    const violations = graph.sourceFiles.flatMap((sourceFile) => {
      const lineCount = sourceFile.getLineAndCharacterOfPosition(sourceFile.end).line + 1;

      return lineCount <= MAX_SOURCE_FILE_LINES
        ? []
        : [
            `${formatRelative(graph, sourceFile.fileName)} has ${lineCount} lines; maximum is ${MAX_SOURCE_FILE_LINES}`,
          ];
    });

    expect(violations).toEqual([]);
  });
});

function isAllowedSourceFileName(fileName: string): boolean {
  if (fileName === "index.ts") {
    return true;
  }

  const parts = fileName.split(".");
  const extension = parts.pop();

  return extension === "ts" && parts.length > 0 && parts.every(isLowerCamelName);
}

function isLowerCamelName(name: string): boolean {
  return /^[a-z][A-Za-z0-9]*$/.test(name);
}
