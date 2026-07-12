import { existsSync, readdirSync, statSync } from "node:fs";
import type { Stats } from "node:fs";
import path from "node:path";
import * as ts from "typescript";

/** 描述 harness 源码树中两个 TypeScript 文件之间的一条已解析依赖。 */
export interface SourceDependency {
  /** 声明依赖的源码文件规范化绝对路径。 */
  importer: string;
  /** 依赖指向的源码文件规范化绝对路径。 */
  imported: string;
  /** TypeScript import 或 export 节点中原样表示的 module specifier。 */
  specifier: string;
}

/** 保存 architecture tests 使用的 compiler program 和确定性依赖数据。 */
export interface SourceGraph {
  /** liushi-harness 包根目录的规范化绝对路径。 */
  harnessRoot: string;
  /** 包源码根目录的规范化绝对路径。 */
  srcRoot: string;
  /** 从包 tsconfig 创建的 TypeScript program。 */
  program: ts.Program;
  /** 位于 src 下方的非声明源码文件。 */
  sourceFiles: ts.SourceFile[];
  /** importer 与 target 均位于 src 下方的已解析依赖。 */
  dependencies: SourceDependency[];
}

/** 标识按依赖顺序排列的已批准顶层源码分层。 */
export enum ArchitectureLayer {
  /** 不依赖业务层或运行时层的共享 primitives。 */
  Common = "common",
  /** 业务规则和 domain state。 */
  Domain = "domain",
  /** Use cases 与 outbound port contracts。 */
  Application = "application",
  /** application ports 的 runtime 与 persistence 实现。 */
  Infrastructure = "infrastructure",
  /** 面向用户的输入输出转换。 */
  Presentation = "presentation",
  /** 进程启动和具体依赖装配。 */
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

/** 创建由 compiler 支撑的全部内部源码依赖图。 */
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

/** 从单个 AST 收集 static import、re-export 和字面量 dynamic-import specifiers。 */
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

/** 按文件系统顺序递归列出目录下的规范化文件路径。 */
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

/** 按文件系统顺序递归列出 root 下的规范化目录路径。 */
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

/** 查找源码依赖环并去重，每条路径包含闭环文件。 */
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

/** 将绝对路径格式化为相对 harness 包的路径，便于测试诊断阅读。 */
export function formatRelative(graph: Pick<SourceGraph, "harnessRoot">, fileName: string): string {
  return normalizePath(path.relative(graph.harnessRoot, fileName));
}

/** 返回包含某个源码文件的已批准顶层 architecture layer。 */
export function getLayer(graph: SourceGraph, fileName: string): ArchitectureLayer | undefined {
  const [layerName] = path.relative(graph.srcRoot, fileName).split(path.sep);

  return architectureLayers.find((architectureLayer) => architectureLayer === layerName);
}

/** 判断目录是否暴露 index.ts public entry point。 */
export function hasIndexFile(directory: string): boolean {
  return existsSync(path.join(directory, "index.ts"));
}

/** 判断目录树是否至少包含一个 TypeScript 源码文件。 */
export function hasTypescriptDescendants(directory: string): boolean {
  return collectFiles(directory).some((fileName) => fileName.endsWith(".ts"));
}

/** 判断文件是否为 index.ts module entry point。 */
export function isPublicEntryPoint(fileName: string): boolean {
  return path.basename(fileName) === "index.ts";
}

/** 判断两个文件是否属于同一个最近 index.ts 管辖的 public module。 */
export function isSamePublicModule(graph: SourceGraph, left: string, right: string): boolean {
  return findPublicModuleRoot(graph.srcRoot, left) === findPublicModuleRoot(graph.srcRoot, right);
}

/** 判断候选路径是否为 root 本身或其后代路径。 */
export function isWithin(candidate: string, root: string): boolean {
  const relativePath = path.relative(root, candidate);

  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

/** 规范化路径分隔符和路径片段，以便稳定比较 graph。 */
export function normalizePath(fileName: string): string {
  return path.normalize(fileName);
}

/** 列出目录直接条目的规范化绝对路径。 */
export function readDirectoryEntries(directory: string): string[] {
  return readdirSync(directory).map((entry) => normalizePath(path.join(directory, entry)));
}

/** 格式化 AST 节点的一基源码位置，用于可执行的失败信息。 */
export function sourceLocation(sourceFile: ts.SourceFile, node: ts.Node): string {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));

  return `${normalizePath(sourceFile.fileName)}:${position.line + 1}:${position.character + 1}`;
}

/** 读取 layout rule 所检查路径的文件系统元数据。 */
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
