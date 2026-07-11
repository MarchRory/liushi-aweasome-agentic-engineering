import {
  ProjectConfigDocumentParseStatus,
  ProjectTextFileReadStatus,
  type ProjectConfigParserPort,
  type ProjectTextFileReadResult,
} from "#application/ports/index.js";
import { ResultStatus } from "#common/index.js";
import {
  ProjectConfigKind,
  ProjectConfigParseStatus,
  ProjectDiagnosticCode,
  ProjectDiagnosticSeverity,
  ProjectPackageManager,
  type ProjectConfigFinding,
  type ProjectDiscoveryDiagnostic,
  type ProjectPackageManagerFact,
} from "#domain/projectDiscovery/index.js";
import type { RepositoryId } from "#domain/workspace/index.js";

import { analyzeCompilerConfig } from "./compilerConfigAnalyzer.js";
import { analyzePackageManifest } from "./packageManifestAnalyzer.js";
import type {
  AnalyzedProjectConfigs,
  ClassifiedProjectConfig,
} from "./projectAnalysis.contracts.js";

/** 分析配置文件所需的显式上下文。 */
export interface AnalyzeProjectConfigsInput {
  /** 当前 Repository。 */
  repositoryId: RepositoryId;
  /** 已按路径稳定排序的配置分类。 */
  classifications: readonly ClassifiedProjectConfig[];
  /** FileSystem Port 的批量读取结果。 */
  reads: readonly ProjectTextFileReadResult[];
}

/** 将配置读取结果转换为脱敏事实、Candidate 输入和诊断。 */
export function analyzeProjectConfigs(
  input: AnalyzeProjectConfigsInput,
  parser: ProjectConfigParserPort,
): AnalyzedProjectConfigs {
  const readsByPath = new Map(input.reads.map((read) => [read.relativePath, read]));
  const configFiles: ProjectConfigFinding[] = [];
  const packages: AnalyzedProjectConfigs["packages"][number][] = [];
  const compilerConfigs: AnalyzedProjectConfigs["compilerConfigs"][number][] = [];
  const packageManagers: ProjectPackageManagerFact[] = [];
  const frameworkHints: AnalyzedProjectConfigs["frameworkHints"][number][] = [];
  const diagnostics: ProjectDiscoveryDiagnostic[] = [];

  for (const classification of input.classifications) {
    const lockManager = getLockfilePackageManager(classification);
    if (lockManager !== undefined) {
      packageManagers.push(lockManager);
    }
    const read = readsByPath.get(classification.relativePath);
    if (read === undefined) {
      configFiles.push(toPresenceFinding(classification));
      continue;
    }
    if (read.status !== ProjectTextFileReadStatus.Read) {
      configFiles.push(toUnavailableFinding(classification));
      diagnostics.push(toReadDiagnostic(input, classification, read));
      continue;
    }
    if (classification.executable || classification.format === undefined) {
      configFiles.push({
        kind: classification.kind,
        relativePath: classification.relativePath,
        ...(read.contentDigest === undefined ? {} : { contentDigest: read.contentDigest }),
        parseStatus: ProjectConfigParseStatus.PresenceOnly,
      });
      if (classification.executable) {
        diagnostics.push({
          code: ProjectDiagnosticCode.ExecutableConfigNotEvaluated,
          severity: ProjectDiagnosticSeverity.Warning,
          repositoryId: input.repositoryId,
          relativePath: classification.relativePath,
          message: "Executable project configuration was not imported or evaluated.",
        });
      }
      continue;
    }

    const parsed = parser.parse({ format: classification.format, content: read.content ?? "" });
    if (parsed.status === ProjectConfigDocumentParseStatus.Invalid) {
      configFiles.push({
        kind: classification.kind,
        relativePath: classification.relativePath,
        ...(read.contentDigest === undefined ? {} : { contentDigest: read.contentDigest }),
        parseStatus: ProjectConfigParseStatus.Invalid,
      });
      diagnostics.push(configParseDiagnostic(input.repositoryId, classification.relativePath));
      continue;
    }
    configFiles.push({
      kind: classification.kind,
      relativePath: classification.relativePath,
      ...(read.contentDigest === undefined ? {} : { contentDigest: read.contentDigest }),
      parseStatus: ProjectConfigParseStatus.Parsed,
    });
    if (classification.kind === ProjectConfigKind.PackageManifest) {
      const analysis = analyzePackageManifest(parsed.value, classification.relativePath);
      if (analysis.status === ResultStatus.Failure) {
        diagnostics.push(configParseDiagnostic(input.repositoryId, classification.relativePath));
      } else {
        packages.push(analysis.value.packageFact);
        frameworkHints.push(...analysis.value.frameworkHints);
        if (analysis.value.packageManager !== undefined) {
          packageManagers.push(analysis.value.packageManager);
        }
      }
    }
    if (classification.kind === ProjectConfigKind.TypeScript) {
      const analysis = analyzeCompilerConfig(parsed.value, classification.relativePath);
      if (analysis.status === ResultStatus.Failure) {
        diagnostics.push(configParseDiagnostic(input.repositoryId, classification.relativePath));
      } else {
        compilerConfigs.push(analysis.value);
        if (analysis.value.extendsRef !== undefined) {
          diagnostics.push({
            code: ProjectDiagnosticCode.ConfigInheritanceUnresolved,
            severity: ProjectDiagnosticSeverity.Warning,
            repositoryId: input.repositoryId,
            relativePath: classification.relativePath,
            message:
              "Compiler config inheritance is recorded but not resolved by this scanner version.",
          });
        }
      }
    }
  }

  addPackageManagerDiagnostic(packageManagers, input.repositoryId, diagnostics);
  return {
    configFiles: sortConfigFindings(configFiles),
    packages: [...packages].sort((a, b) => compare(a.manifestPath, b.manifestPath)),
    compilerConfigs: [...compilerConfigs].sort((a, b) => compare(a.configPath, b.configPath)),
    packageManagers: deduplicatePackageManagers(packageManagers),
    frameworkHints: [...frameworkHints].sort((a, b) =>
      compare(`${a.frameworkId}:${a.packageName}`, `${b.frameworkId}:${b.packageName}`),
    ),
    diagnostics,
  };
}

function getLockfilePackageManager(
  classification: ClassifiedProjectConfig,
): ProjectPackageManagerFact | undefined {
  if (classification.kind !== ProjectConfigKind.Lockfile) {
    return undefined;
  }
  const name = classification.relativePath.toLowerCase();
  const manager = name.endsWith("pnpm-lock.yaml")
    ? ProjectPackageManager.Pnpm
    : name.endsWith("yarn.lock")
      ? ProjectPackageManager.Yarn
      : name.endsWith("bun.lock") || name.endsWith("bun.lockb")
        ? ProjectPackageManager.Bun
        : ProjectPackageManager.Npm;
  return { manager, sourcePath: classification.relativePath };
}

function toPresenceFinding(classification: ClassifiedProjectConfig): ProjectConfigFinding {
  return {
    kind: classification.kind,
    relativePath: classification.relativePath,
    parseStatus: ProjectConfigParseStatus.PresenceOnly,
  };
}

function toUnavailableFinding(classification: ClassifiedProjectConfig): ProjectConfigFinding {
  return {
    kind: classification.kind,
    relativePath: classification.relativePath,
    parseStatus: ProjectConfigParseStatus.Unavailable,
  };
}

function toReadDiagnostic(
  input: AnalyzeProjectConfigsInput,
  classification: ClassifiedProjectConfig,
  read: ProjectTextFileReadResult,
): ProjectDiscoveryDiagnostic {
  const code =
    read.status === ProjectTextFileReadStatus.InvalidEncoding
      ? ProjectDiagnosticCode.InvalidTextEncoding
      : ProjectDiagnosticCode.PathUnreadable;
  return {
    code,
    severity: ProjectDiagnosticSeverity.Blocking,
    repositoryId: input.repositoryId,
    relativePath: classification.relativePath,
    message: "Project configuration could not be read as safe strict UTF-8 text.",
  };
}

function configParseDiagnostic(
  repositoryId: RepositoryId,
  relativePath: string,
): ProjectDiscoveryDiagnostic {
  return {
    code: ProjectDiagnosticCode.ConfigParseError,
    severity: ProjectDiagnosticSeverity.Blocking,
    repositoryId,
    relativePath,
    message: "Project configuration does not match the supported structured schema.",
  };
}

function addPackageManagerDiagnostic(
  facts: readonly ProjectPackageManagerFact[],
  repositoryId: RepositoryId,
  diagnostics: ProjectDiscoveryDiagnostic[],
): void {
  if (new Set(facts.map((fact) => fact.manager)).size > 1) {
    diagnostics.push({
      code: ProjectDiagnosticCode.MultiplePackageManagers,
      severity: ProjectDiagnosticSeverity.Warning,
      repositoryId,
      message: "Multiple package managers were detected and require Human classification.",
    });
  }
}

function deduplicatePackageManagers(
  facts: readonly ProjectPackageManagerFact[],
): readonly ProjectPackageManagerFact[] {
  return [
    ...new Map(facts.map((fact) => [`${fact.manager}:${fact.sourcePath}`, fact])).values(),
  ].sort((a, b) => compare(`${a.manager}:${a.sourcePath}`, `${b.manager}:${b.sourcePath}`));
}

function sortConfigFindings(
  findings: readonly ProjectConfigFinding[],
): readonly ProjectConfigFinding[] {
  return [...findings].sort((a, b) =>
    compare(`${a.kind}:${a.relativePath}`, `${b.kind}:${b.relativePath}`),
  );
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
