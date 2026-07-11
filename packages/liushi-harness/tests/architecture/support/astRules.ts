import * as ts from "typescript";

import type { SourceGraph } from "./architectureGraph.js";
import { sourceLocation } from "./architectureGraph.js";

/** Describes an AST policy violation and the source file that contains it. */
export interface AstFinding {
  /** Absolute path of the source file containing the violation. */
  fileName: string;
  /** Human-readable violation including its one-based source location. */
  message: string;
}

/** Finds forbidden Node.js imports and runtime globals in source files selected by the caller. */
export function collectForbiddenRuntimeFindings(
  graph: SourceGraph,
  isForbiddenFile: (sourceFile: ts.SourceFile) => boolean,
): AstFinding[] {
  const findings: AstFinding[] = [];

  for (const sourceFile of graph.sourceFiles.filter(isForbiddenFile)) {
    const visit = (node: ts.Node): void => {
      if (
        ts.isImportDeclaration(node) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier) &&
        node.moduleSpecifier.text.startsWith("node:")
      ) {
        findings.push({
          fileName: sourceFile.fileName,
          message: `${sourceLocation(sourceFile, node)} imports ${node.moduleSpecifier.text}`,
        });
      }

      if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments.length === 1
      ) {
        const [moduleSpecifier] = node.arguments;

        if (
          moduleSpecifier &&
          ts.isStringLiteral(moduleSpecifier) &&
          moduleSpecifier.text.startsWith("node:")
        ) {
          findings.push({
            fileName: sourceFile.fileName,
            message: `${sourceLocation(sourceFile, node)} dynamically imports ${moduleSpecifier.text}`,
          });
        }
      }

      if (ts.isIdentifier(node) && (node.text === "process" || node.text === "console")) {
        findings.push({
          fileName: sourceFile.fileName,
          message: `${sourceLocation(sourceFile, node)} references ${node.text}`,
        });
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  return findings;
}

/** Collects identifier-based constructor calls so composition-root ownership can be verified. */
export function collectNewExpressionNames(sourceFile: ts.SourceFile): Array<{
  className: string;
  location: string;
}> {
  const expressions: Array<{ className: string; location: string }> = [];

  const visit = (node: ts.Node): void => {
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression)) {
      expressions.push({
        className: node.expression.text,
        location: sourceLocation(sourceFile, node),
      });
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return expressions;
}

/** Collects exported concrete class names declared by infrastructure adapter implementation files. */
export function collectExportedConcreteAdapterClassNames(graph: SourceGraph): Set<string> {
  const classNames = new Set<string>();

  for (const sourceFile of graph.sourceFiles) {
    if (!sourceFile.fileName.endsWith(".adapter.ts")) {
      continue;
    }

    for (const statement of sourceFile.statements) {
      if (
        ts.isClassDeclaration(statement) &&
        statement.name &&
        hasModifier(statement, ts.SyntaxKind.ExportKeyword)
      ) {
        classNames.add(statement.name.text);
      }
    }
  }

  return classNames;
}

/** Finds exported declarations and interface properties that lack attached TSDoc nodes. */
export function collectUndocumentedExportFindings(graph: SourceGraph): string[] {
  const findings: string[] = [];

  for (const sourceFile of graph.sourceFiles) {
    for (const statement of sourceFile.statements) {
      if (!isDocumentableExport(statement)) {
        continue;
      }

      const name = getDeclarationName(statement);

      if (!hasTsDoc(sourceFile, statement)) {
        findings.push(`${sourceLocation(sourceFile, statement)} exported ${name} is missing TSDoc`);
      }

      if (ts.isEnumDeclaration(statement)) {
        for (const member of statement.members) {
          if (!hasTsDoc(sourceFile, member)) {
            findings.push(
              `${sourceLocation(sourceFile, member)} enum member ${statement.name.text}.${member.name.getText(sourceFile)} is missing TSDoc`,
            );
          }
        }
      }

      if (ts.isInterfaceDeclaration(statement)) {
        for (const member of statement.members) {
          if (ts.isPropertySignature(member) && !hasTsDoc(sourceFile, member)) {
            findings.push(
              `${sourceLocation(sourceFile, member)} interface property ${statement.name.text}.${member.name.getText(sourceFile)} is missing TSDoc`,
            );
          }
        }
      }
    }
  }

  return findings;
}

function getDeclarationName(node: ts.Node): string {
  if (
    (ts.isInterfaceDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) ||
      ts.isEnumDeclaration(node) ||
      ts.isClassDeclaration(node) ||
      ts.isFunctionDeclaration(node)) &&
    node.name
  ) {
    return node.name.text;
  }

  if (ts.isClassDeclaration(node)) {
    return "default class";
  }

  if (ts.isFunctionDeclaration(node)) {
    return "default function";
  }

  return "declaration";
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return (
    ts.canHaveModifiers(node) &&
    ts.getModifiers(node)?.some((modifier) => modifier.kind === kind) === true
  );
}

function hasTsDoc(sourceFile: ts.SourceFile, node: ts.Node): boolean {
  const documentedNode = node as ts.Node & { jsDoc?: ts.JSDoc[] };

  return (
    documentedNode.jsDoc?.some((comment) => comment.getFullText(sourceFile).trim().length > 0) ===
    true
  );
}

function isDocumentableExport(
  node: ts.Statement,
): node is
  | ts.InterfaceDeclaration
  | ts.TypeAliasDeclaration
  | ts.EnumDeclaration
  | ts.ClassDeclaration
  | ts.FunctionDeclaration {
  return (
    (ts.isInterfaceDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) ||
      ts.isEnumDeclaration(node) ||
      ts.isClassDeclaration(node) ||
      ts.isFunctionDeclaration(node)) &&
    hasModifier(node, ts.SyntaxKind.ExportKeyword)
  );
}
