import * as ts from "typescript";

import type { SourceGraph } from "./architectureGraph.js";
import { normalizePath, sourceLocation } from "./architectureGraph.js";

/** 描述一条 AST 策略违规及其所在源码文件。 */
export interface AstFinding {
  /** 包含违规的源码文件绝对路径。 */
  fileName: string;
  /** 包含一基源码位置的可读违规说明。 */
  message: string;
}

/** 在调用方选定的源码文件中查找被禁止的 Node.js imports 和运行时 globals。 */
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

/** 收集基于 identifier 的构造调用，以便校验 composition-root 所有权。 */
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

/** 收集 infrastructure adapter 实现文件声明的 exported concrete class 名称。 */
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

/** 查找缺少附着 TSDoc 节点的 exported declarations 和 interface properties。 */
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

/** 查找不含 CJK 字符且不属于最小白名单的源码注释。 */
export function collectNonCjkSourceCommentFindings(graph: SourceGraph): string[] {
  const findings: string[] = [];

  for (const sourceFile of graph.sourceFiles) {
    for (const comment of collectCommentRanges(sourceFile)) {
      const text = sourceFile.getFullText().slice(comment.pos, comment.end);

      if (hasCjk(text) || isAllowedNonCjkComment(text)) {
        continue;
      }

      findings.push(
        `${formatCommentLocation(sourceFile, comment.pos)} comment must contain CJK text`,
      );
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

function collectCommentRanges(sourceFile: ts.SourceFile): ts.CommentRange[] {
  const text = sourceFile.getFullText();
  const comments: ts.CommentRange[] = [];
  const seen = new Set<string>();

  const addComment = (comment: ts.CommentRange): void => {
    const key = `${comment.pos}:${comment.end}`;

    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    comments.push(comment);
  };

  const visit = (node: ts.Node): void => {
    for (const comment of ts.getLeadingCommentRanges(text, node.pos) ?? []) {
      addComment(comment);
    }

    for (const comment of ts.getTrailingCommentRanges(text, node.end) ?? []) {
      addComment(comment);
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return comments.sort((left, right) => left.pos - right.pos);
}

function formatCommentLocation(sourceFile: ts.SourceFile, position: number): string {
  const location = sourceFile.getLineAndCharacterOfPosition(position);

  return `${normalizePath(sourceFile.fileName)}:${location.line + 1}:${location.character + 1}`;
}

function hasTsDoc(sourceFile: ts.SourceFile, node: ts.Node): boolean {
  const documentedNode = node as ts.Node & { jsDoc?: ts.JSDoc[] };

  return (
    documentedNode.jsDoc?.some((comment) => comment.getFullText(sourceFile).trim().length > 0) ===
    true
  );
}

function hasCjk(text: string): boolean {
  return /[\u3400-\u9fff\uf900-\ufaff]/u.test(text);
}

function isAllowedNonCjkComment(text: string): boolean {
  const normalized = text.trim();

  return (
    normalized.startsWith("#!") ||
    /^\/\*!\s*[\s\S]*(?:@license|copyright|license)/iu.test(normalized) ||
    /^\/\/\s*(?:c8|istanbul) ignore\b/u.test(normalized) ||
    /^\/\*\s*(?:c8|istanbul) ignore\b[\s\S]*\*\/$/u.test(normalized) ||
    /^\/\/\s*(?:@ts-|eslint(?:-| |$)|prettier-ignore\b)/u.test(normalized) ||
    /^\/\*\s*(?:@ts-|eslint(?:-| |$)|prettier-ignore\b)[\s\S]*\*\/$/u.test(normalized)
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
