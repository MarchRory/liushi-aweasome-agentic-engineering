import { z } from "zod";

import { failure, success, type Result } from "#common/index.js";
import {
  ProjectDependencyKind,
  ProjectPackageManager,
  type ProjectDependencyFact,
  type ProjectFrameworkHint,
  type ProjectPackageFact,
  type ProjectPackageManagerFact,
} from "#domain/projectDiscovery/index.js";

import type { PackageManifestAnalysis } from "./projectAnalysis.contracts.js";

const stringRecordSchema = z.record(z.string(), z.string());
const workspaceSchema = z.union([
  z.array(z.string()),
  z.object({ packages: z.array(z.string()) }).passthrough(),
]);
const packageManifestSchema = z
  .object({
    name: z.string().min(1).optional(),
    scripts: stringRecordSchema.optional(),
    workspaces: workspaceSchema.optional(),
    packageManager: z.string().min(1).optional(),
    dependencies: stringRecordSchema.optional(),
    devDependencies: stringRecordSchema.optional(),
    peerDependencies: stringRecordSchema.optional(),
    optionalDependencies: stringRecordSchema.optional(),
  })
  .passthrough();

const FRAMEWORK_BY_PACKAGE = new Map<string, string>([
  ["react", "react"],
  ["react-dom", "react"],
  ["next", "nextjs"],
  ["vue", "vue"],
  ["nuxt", "nuxt"],
  ["@angular/core", "angular"],
  ["svelte", "svelte"],
  ["@sveltejs/kit", "sveltekit"],
  ["vite", "vite"],
  ["webpack", "webpack"],
  ["vitest", "vitest"],
  ["jest", "jest"],
  ["@playwright/test", "playwright"],
  ["eslint", "eslint"],
  ["prettier", "prettier"],
  ["typescript", "typescript"],
]);

/** 从已解析 JSON Value 提取 Package Manifest 的脱敏事实。 */
export function analyzePackageManifest(
  value: unknown,
  manifestPath: string,
): Result<PackageManifestAnalysis, string> {
  const parsed = packageManifestSchema.safeParse(value);
  if (!parsed.success) {
    return failure("Package manifest fields do not match the supported schema.");
  }

  const dependencies = collectDependencies(parsed.data, manifestPath);
  const packageFact: ProjectPackageFact = {
    manifestPath,
    ...(parsed.data.name === undefined ? {} : { packageName: parsed.data.name }),
    scriptNames: Object.keys(parsed.data.scripts ?? {}).sort(compare),
    workspacePatterns: getWorkspacePatterns(parsed.data.workspaces),
    dependencies,
  };
  const packageManager = parsePackageManager(parsed.data.packageManager, manifestPath);
  return success({
    packageFact,
    ...(packageManager === undefined ? {} : { packageManager }),
    frameworkHints: collectFrameworkHints(dependencies),
  });
}

function collectDependencies(
  manifest: z.infer<typeof packageManifestSchema>,
  manifestPath: string,
): readonly ProjectDependencyFact[] {
  return [
    ...toDependencyFacts(manifest.dependencies, ProjectDependencyKind.Runtime, manifestPath),
    ...toDependencyFacts(manifest.devDependencies, ProjectDependencyKind.Development, manifestPath),
    ...toDependencyFacts(manifest.peerDependencies, ProjectDependencyKind.Peer, manifestPath),
    ...toDependencyFacts(
      manifest.optionalDependencies,
      ProjectDependencyKind.Optional,
      manifestPath,
    ),
  ].sort((left, right) =>
    compare(
      `${left.packageName}:${left.kind}:${left.manifestPath}`,
      `${right.packageName}:${right.kind}:${right.manifestPath}`,
    ),
  );
}

function toDependencyFacts(
  dependencies: Readonly<Record<string, string>> | undefined,
  kind: ProjectDependencyKind,
  manifestPath: string,
): readonly ProjectDependencyFact[] {
  return Object.entries(dependencies ?? {}).map(([packageName, declaredRange]) => ({
    packageName,
    declaredRange,
    kind,
    manifestPath,
  }));
}

function getWorkspacePatterns(
  workspaces: z.infer<typeof workspaceSchema> | undefined,
): readonly string[] {
  if (workspaces === undefined) {
    return [];
  }
  return [...(Array.isArray(workspaces) ? workspaces : workspaces.packages)].sort(compare);
}

function parsePackageManager(
  value: string | undefined,
  sourcePath: string,
): ProjectPackageManagerFact | undefined {
  const managerName = value?.split("@")[0]?.toLowerCase();
  const manager = Object.values(ProjectPackageManager).find(
    (candidate) => candidate === managerName,
  );
  return manager === undefined ? undefined : { manager, sourcePath };
}

function collectFrameworkHints(
  dependencies: readonly ProjectDependencyFact[],
): readonly ProjectFrameworkHint[] {
  return dependencies
    .flatMap((dependency) => {
      const frameworkId = FRAMEWORK_BY_PACKAGE.get(dependency.packageName);
      return frameworkId === undefined
        ? []
        : [
            {
              frameworkId,
              packageName: dependency.packageName,
              declaredRange: dependency.declaredRange,
              sourcePath: dependency.manifestPath,
            },
          ];
    })
    .sort((left, right) =>
      compare(
        `${left.frameworkId}:${left.packageName}`,
        `${right.frameworkId}:${right.packageName}`,
      ),
    );
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
