import type {
  ContentDigestPort,
  ProjectConfigParserPort,
  ProjectFileSystemPort,
  ProjectRepositoryFileInventory,
} from "#application/ports/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  type Result,
} from "#common/index.js";
import {
  parseProjectScanManifest,
  type ProjectDiscoveryReport,
  type ProjectScanManifest,
  type ProjectScanRepository,
} from "#domain/projectDiscovery/index.js";

import {
  analyzeProjectConfigs,
  classifyProjectConfigFile,
  type ClassifiedProjectConfig,
} from "./analysis/index.js";
import {
  assembleProjectDiscoveryReport,
  assembleProjectProfileCandidate,
} from "./assembly/index.js";
import type { ScanProjectInput } from "./scanProject.input.js";

/** 对显式多仓执行无副作用 Project Discovery。 */
export class ScanProjectUseCase {
  public constructor(
    private readonly fileSystem: ProjectFileSystemPort,
    private readonly configParser: ProjectConfigParserPort,
    private readonly digestPort: ContentDigestPort,
  ) {}

  /** 扫描 Repository 事实并只生成待 Human Review 的 Candidate。 */
  public async execute(
    input: ScanProjectInput,
  ): Promise<Result<ProjectDiscoveryReport, HarnessError>> {
    const manifest = parseProjectScanManifest(input.manifest);
    if (manifest.status === ResultStatus.Failure) {
      return manifest;
    }

    const profiles: ProjectDiscoveryReport["profileCandidates"][number][] = [];
    const roots = new Map<string, string>();
    for (const repository of sortRepositories(manifest.value)) {
      const inventory = await this.fileSystem.inspectRepository({
        repositoryId: repository.repositoryId,
        localRoot: repository.localRoot,
        maxFiles: manifest.value.budget.maxFilesPerRepository,
        maxDirectories: manifest.value.budget.maxDirectoriesPerRepository,
        maxDepth: manifest.value.budget.maxDepth,
      });
      if (inventory.status === ResultStatus.Failure) {
        return inventory;
      }
      const duplicateRoot = roots.get(inventory.value.rootIdentity);
      if (duplicateRoot !== undefined) {
        return failure(
          new HarnessError(
            HarnessErrorCode.InvalidInput,
            "Project scan repositories cannot resolve to the same root.",
            {
              repositoryId: repository.repositoryId,
              conflictingRepositoryId: duplicateRoot,
            },
          ),
        );
      }
      roots.set(inventory.value.rootIdentity, repository.repositoryId);

      const profile = await this.scanRepository(manifest.value, repository, inventory.value);
      if (profile.status === ResultStatus.Failure) {
        return profile;
      }
      profiles.push(profile.value);
    }
    return assembleProjectDiscoveryReport(manifest.value, profiles, this.digestPort);
  }

  private async scanRepository(
    manifest: ProjectScanManifest,
    repository: ProjectScanRepository,
    inventory: ProjectRepositoryFileInventory,
  ): Promise<Result<ProjectDiscoveryReport["profileCandidates"][number], HarnessError>> {
    const classifications = inventory.files
      .flatMap((relativePath) => {
        const classification = classifyProjectConfigFile(relativePath);
        return classification === undefined ? [] : [classification];
      })
      .sort((left, right) => compare(left.relativePath, right.relativePath));
    const selected = classifications.slice(0, manifest.budget.maxConfigFilesPerRepository);
    const configFileLimitReached = classifications.length > selected.length;
    const pathsToRead = selectConfigPathsToRead(selected);
    const reads = await this.fileSystem.readTextFiles({
      repositoryId: repository.repositoryId,
      localRoot: repository.localRoot,
      relativePaths: pathsToRead,
      maxFileBytes: manifest.budget.maxConfigFileBytes,
      maxTotalBytes: manifest.budget.maxTotalConfigBytesPerRepository,
    });
    if (reads.status === ResultStatus.Failure) {
      return reads;
    }
    const configs = analyzeProjectConfigs(
      {
        repositoryId: repository.repositoryId,
        classifications: selected,
        reads: reads.value,
        maxConfigFileBytes: manifest.budget.maxConfigFileBytes,
      },
      this.configParser,
    );
    return assembleProjectProfileCandidate(
      { manifest, repository, inventory, configs, configFileLimitReached },
      this.digestPort,
    );
  }
}

function selectConfigPathsToRead(
  classifications: readonly ClassifiedProjectConfig[],
): readonly string[] {
  return classifications
    .filter((classification) => classification.format !== undefined || classification.executable)
    .map((classification) => classification.relativePath);
}

function sortRepositories(manifest: ProjectScanManifest): readonly ProjectScanRepository[] {
  return [...manifest.repositories].sort((left, right) =>
    compare(left.repositoryId, right.repositoryId),
  );
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
