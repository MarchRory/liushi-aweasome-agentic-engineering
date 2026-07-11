import { ProjectConfigDocumentFormat } from "#application/ports/index.js";
import { ProjectConfigKind } from "#domain/projectDiscovery/index.js";

import type { ClassifiedProjectConfig } from "./projectAnalysis.contracts.js";

const LOCKFILE_KINDS = new Set([
  "package-lock.json",
  "npm-shrinkwrap.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
]);

/** 识别 Scanner 可以安全读取或仅记录存在的配置文件。 */
export function classifyProjectConfigFile(
  relativePath: string,
): ClassifiedProjectConfig | undefined {
  const normalized = relativePath.toLowerCase();
  const name = normalized.slice(normalized.lastIndexOf("/") + 1);
  const extensionFormat = getStructuredFormat(name);

  if (name === "package.json") {
    return classification(
      relativePath,
      ProjectConfigKind.PackageManifest,
      false,
      ProjectConfigDocumentFormat.Jsonc,
    );
  }
  if (/^(?:ts|js)config(?:\.[^.]+)*\.json$/.test(name)) {
    return classification(
      relativePath,
      ProjectConfigKind.TypeScript,
      false,
      ProjectConfigDocumentFormat.Jsonc,
    );
  }
  if (LOCKFILE_KINDS.has(name)) {
    return classification(relativePath, ProjectConfigKind.Lockfile, false);
  }
  if (
    [
      "pnpm-workspace.yaml",
      "pnpm-workspace.yml",
      "lerna.json",
      "rush.json",
      "nx.json",
      "turbo.json",
    ].includes(name)
  ) {
    return classification(relativePath, ProjectConfigKind.Workspace, false, extensionFormat);
  }
  if (isEslintConfig(name)) {
    return classification(
      relativePath,
      ProjectConfigKind.Eslint,
      isExecutableConfig(name),
      extensionFormat,
    );
  }
  if (isPrettierConfig(name)) {
    return classification(
      relativePath,
      ProjectConfigKind.Prettier,
      isExecutableConfig(name),
      extensionFormat,
    );
  }
  if (isStylelintConfig(name)) {
    return classification(
      relativePath,
      ProjectConfigKind.Stylelint,
      isExecutableConfig(name),
      extensionFormat,
    );
  }
  if (isTestConfig(name)) {
    return classification(
      relativePath,
      ProjectConfigKind.Test,
      isExecutableConfig(name),
      extensionFormat,
    );
  }
  if (isBuildConfig(name)) {
    return classification(
      relativePath,
      ProjectConfigKind.Build,
      isExecutableConfig(name),
      extensionFormat,
    );
  }
  if (isCiConfig(normalized, name)) {
    return classification(
      relativePath,
      ProjectConfigKind.ContinuousIntegration,
      false,
      extensionFormat,
    );
  }
  if (name === "codeowners") {
    return classification(relativePath, ProjectConfigKind.CodeOwners, false);
  }
  if (name === "agents.md") {
    return classification(relativePath, ProjectConfigKind.CodexInstruction, false);
  }
  if (name === "claude.md") {
    return classification(relativePath, ProjectConfigKind.ClaudeInstruction, false);
  }
  if (normalized.includes("/.liushi-harness/") || normalized.startsWith(".liushi-harness/")) {
    return classification(relativePath, ProjectConfigKind.Harness, false, extensionFormat);
  }
  if (name.startsWith(".dependency-cruiser") || name.startsWith("dependency-cruiser")) {
    return classification(
      relativePath,
      ProjectConfigKind.ArchitectureValidation,
      isExecutableConfig(name),
      extensionFormat,
    );
  }
  return undefined;
}

function classification(
  relativePath: string,
  kind: ProjectConfigKind,
  executable: boolean,
  format?: ProjectConfigDocumentFormat,
): ClassifiedProjectConfig {
  return {
    relativePath,
    kind,
    ...(format === undefined ? {} : { format }),
    executable,
  };
}

function getStructuredFormat(name: string): ProjectConfigDocumentFormat | undefined {
  if (name.endsWith(".json") || name.endsWith(".jsonc")) {
    return ProjectConfigDocumentFormat.Jsonc;
  }
  if (name.endsWith(".yaml") || name.endsWith(".yml")) {
    return ProjectConfigDocumentFormat.Yaml;
  }
  return undefined;
}

function isExecutableConfig(name: string): boolean {
  return /\.(?:cjs|mjs|js|cts|mts|ts)$/.test(name);
}

function isEslintConfig(name: string): boolean {
  return name === ".eslintrc" || name.startsWith(".eslintrc.") || name.startsWith("eslint.config.");
}

function isPrettierConfig(name: string): boolean {
  return (
    name === ".prettierrc" || name.startsWith(".prettierrc.") || name.startsWith("prettier.config.")
  );
}

function isStylelintConfig(name: string): boolean {
  return (
    name === ".stylelintrc" ||
    name.startsWith(".stylelintrc.") ||
    name.startsWith("stylelint.config.")
  );
}

function isTestConfig(name: string): boolean {
  return /^(?:vitest|jest|playwright|cypress)(?:\.config)?\./.test(name);
}

function isBuildConfig(name: string): boolean {
  return /^(?:vite|webpack|rollup|next|nuxt|astro|esbuild)(?:\.config)?\./.test(name);
}

function isCiConfig(relativePath: string, name: string): boolean {
  return (
    (relativePath.startsWith(".github/workflows/") && /\.ya?ml$/.test(name)) ||
    name === ".gitlab-ci.yml" ||
    name === ".gitlab-ci.yaml"
  );
}
