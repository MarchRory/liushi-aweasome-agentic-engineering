import { existsSync, readdirSync, statSync } from "node:fs";
import type { Stats } from "node:fs";
import path from "node:path";
import * as ts from "typescript";

/** Describes one resolved dependency between two TypeScript files inside the harness source tree. */
export interface SourceDependency {
  /** Absolute normalized path of the source file that declares the dependency. */
  importer: string;
  /** Absolute normalized path of the source file reached by the dependency. */
  imported: string;
  /** Module specifier exactly as represented by the TypeScript import or export node. */
  specifier: string;
}

/** Holds the compiler program and deterministic dependency data used by architecture tests. */
export interface SourceGraph {
  /** Absolute normalized path of the liushi-harness package root. */
  harnessRoot: string;
  /** Absolute normalized path of the package source root. */
  srcRoot: string;
  /** TypeScript program created from the package tsconfig. */
  program: ts.Program;
  /** Non-declaration source files located beneath src. */
  sourceFiles: ts.SourceFile[];
  /** Resolved dependencies whose importer and target are both beneath src. */
  dependencies: SourceDependency[];
}

/** Identifies an approved top-level source layer in dependency-order sequence. */
export enum ArchitectureLayer {
  /** Shared primitives with no dependency on business or runtime layers. */
  Common = "common",
  /** Business rules and domain state. */
  Domain = "domain",
  /** Use cases and outbound port contracts. */
  Application = "application",
  /** Runtime and persistence implementations of application ports. */
  Infrastructure = "infrastructure",
  /** User-facing input and output translation. */
  Presentation = "presentation",
  /** Process startup and concrete dependency composition. */
  Bootstrap = "bootstrap",
}

const architectureLayers: readonly ArchitectureLayer[] = [
  ArchitectureLayer.Common,
  ArchitectureLayer.Domain,
  ArchitectureLayer.Application,
  ArchitectureLayer.Infrastructure,
  ArchitectureLayer.Presentation,
  ArchitectureLayer.Bootstrap,
];

/** Creates a compiler-backed graph of all internal source dependencies. */
export function createSourceGraph(): SourceGraph {
  const harnessRoot = findHarnessRoot();
  const tsconfigPath = path.join(harnessRoot, "tsconfig.json");
  const configFile = ts.readConfigFile(tsconfigPath, (fileName) => ts.sys.readFile(fileName));

  if (configFile.error) {
    throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n"));
  }

  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, harnessRoot);
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  const srcRoot = path.join(harnessRoot, "src");
  const sourceFiles = program
    .getSourceFiles()
    .filter((sourceFile) => !sourceFile.isDeclarationFile)
    .filter((sourceFile) => isWithin(sourceFile.fileName, srcRoot));
  const dependencies = sourceFiles.flatMap((sourceFile) =>
    collectModuleSpecifiers(sourceFile).flatMap((specifier) => {
      const resolvedModule = ts.resolveModuleName(
        specifier,
        sourceFile.fileName,
        parsed.options,
        ts.sys,
      ).resolvedModule;

      if (!resolvedModule || !isWithin(resolvedModule.resolvedFileName, srcRoot)) {
        return [];
      }

      return [
        {
          importer: normalizePath(sourceFile.fileName),
          imported: normalizePath(resolvedModule.resolvedFileName),
          specifier,
        },
      ];
    }),
  );

  return {
    harnessRoot: normalizePath(harnessRoot),
    srcRoot: normalizePath(srcRoot),
    program,
    sourceFiles,
    dependencies,
  };
}

/** Collects static import, re-export, and literal dynamic-import specifiers from one AST. */
export function collectModuleSpecifiers(sourceFile: ts.SourceFile): string[] {
  const specifiers: string[] = [];

  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    }

    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1
    ) {
      const [moduleSpecifier] = node.arguments;

      if (moduleSpecifier && ts.isStringLiteral(moduleSpecifier)) {
        specifiers.push(moduleSpecifier.text);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return specifiers;
}

/** Recursively lists normalized file paths beneath a directory in filesystem order. */
export function collectFiles(root: string): string[] {
  const entries = readdirSync(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);

    if (entry.isDirectory()) {
      files.push(...collectFiles(entryPath));
      continue;
    }

    files.push(normalizePath(entryPath));
  }

  return files;
}

/** Recursively lists normalized directory paths beneath a root in filesystem order. */
export function collectDirectories(root: string): string[] {
  const entries = readdirSync(root, { withFileTypes: true });
  const directories: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const entryPath = path.join(root, entry.name);
    directories.push(normalizePath(entryPath), ...collectDirectories(entryPath));
  }

  return directories;
}

/** Finds and de-duplicates source dependency cycles, including the closing file in each path. */
export function findCycles(graph: SourceGraph): string[][] {
  const adjacency = new Map<string, string[]>();

  for (const sourceFile of graph.sourceFiles) {
    adjacency.set(normalizePath(sourceFile.fileName), []);
  }

  for (const dependency of graph.dependencies) {
    adjacency.get(dependency.importer)?.push(dependency.imported);
  }

  const cycles: string[][] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];

  const visit = (fileName: string): void => {
    if (visited.has(fileName)) {
      return;
    }

    if (visiting.has(fileName)) {
      const cycleStart = stack.indexOf(fileName);
      cycles.push([...stack.slice(cycleStart), fileName]);
      return;
    }

    visiting.add(fileName);
    stack.push(fileName);

    for (const nextFile of adjacency.get(fileName) ?? []) {
      visit(nextFile);
    }

    stack.pop();
    visiting.delete(fileName);
    visited.add(fileName);
  };

  for (const fileName of adjacency.keys()) {
    visit(fileName);
  }

  return dedupeCycles(cycles);
}

/** Formats an absolute path relative to the harness package for readable test diagnostics. */
export function formatRelative(graph: Pick<SourceGraph, "harnessRoot">, fileName: string): string {
  return normalizePath(path.relative(graph.harnessRoot, fileName));
}

/** Returns the approved top-level architecture layer containing a source file. */
export function getLayer(graph: SourceGraph, fileName: string): ArchitectureLayer | undefined {
  const [layerName] = path.relative(graph.srcRoot, fileName).split(path.sep);

  return architectureLayers.find((architectureLayer) => architectureLayer === layerName);
}

/** Reports whether a directory exposes an index.ts public entry point. */
export function hasIndexFile(directory: string): boolean {
  return existsSync(path.join(directory, "index.ts"));
}

/** Reports whether a directory tree contains at least one TypeScript source file. */
export function hasTypescriptDescendants(directory: string): boolean {
  return collectFiles(directory).some((fileName) => fileName.endsWith(".ts"));
}

/** Reports whether a file is an index.ts module entry point. */
export function isPublicEntryPoint(fileName: string): boolean {
  return path.basename(fileName) === "index.ts";
}

/** Reports whether two files belong to the same nearest index.ts-owned public module. */
export function isSamePublicModule(graph: SourceGraph, left: string, right: string): boolean {
  return findPublicModuleRoot(graph.srcRoot, left) === findPublicModuleRoot(graph.srcRoot, right);
}

/** Reports whether a candidate path is the root itself or a descendant of that root. */
export function isWithin(candidate: string, root: string): boolean {
  const relativePath = path.relative(root, candidate);

  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

/** Normalizes path separators and path segments for stable graph comparisons. */
export function normalizePath(fileName: string): string {
  return path.normalize(fileName);
}

/** Lists normalized absolute paths for the direct entries of a directory. */
export function readDirectoryEntries(directory: string): string[] {
  return readdirSync(directory).map((entry) => normalizePath(path.join(directory, entry)));
}

/** Formats the one-based source location of an AST node for an actionable failure message. */
export function sourceLocation(sourceFile: ts.SourceFile, node: ts.Node): string {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));

  return `${normalizePath(sourceFile.fileName)}:${position.line + 1}:${position.character + 1}`;
}

/** Reads filesystem metadata for a path inspected by a layout rule. */
export function statFile(fileName: string): Stats {
  return statSync(fileName);
}

function dedupeCycles(cycles: string[][]): string[][] {
  const seen = new Set<string>();
  const uniqueCycles: string[][] = [];

  for (const cycle of cycles) {
    const key = cycle.slice().sort().join("|");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueCycles.push(cycle);
  }

  return uniqueCycles;
}

function findHarnessRoot(): string {
  let current = process.cwd();

  for (let attempt = 0; attempt < 6; attempt += 1) {
    if (
      existsSync(path.join(current, "src")) &&
      existsSync(path.join(current, "tsconfig.json")) &&
      path.basename(current) === "liushi-harness"
    ) {
      return current;
    }

    const nestedHarnessRoot = path.join(current, "packages", "liushi-harness");

    if (existsSync(path.join(nestedHarnessRoot, "tsconfig.json"))) {
      return nestedHarnessRoot;
    }

    const parent = path.dirname(current);

    if (parent === current) {
      break;
    }

    current = parent;
  }

  throw new Error("Cannot locate packages/liushi-harness from the current working directory.");
}

function findPublicModuleRoot(srcRoot: string, fileName: string): string {
  let directory = path.dirname(fileName);

  while (isWithin(directory, srcRoot)) {
    if (hasIndexFile(directory)) {
      return normalizePath(directory);
    }

    const parent = path.dirname(directory);

    if (parent === directory) {
      break;
    }

    directory = parent;
  }

  return normalizePath(path.dirname(fileName));
}
